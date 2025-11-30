/* ============================================================
   GLOBAL VARIABLES
============================================================ */

let books = [];
let filteredBooks = [];
let currentCategory = "all";
let currentView = "grid";
let bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");

let sizeFilter = "any";
let pagesFilter = "any";
let sortOption = "relevance";

let currentPage = 1;
const booksPerPage = 100;

const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");

const categoriesLeft = document.getElementById("categories-left");
const categoriesRight = document.getElementById("categories-right");

const booksContainer = document.getElementById("booksContainer");
const resultsInfo = document.getElementById("resultsInfo");

const filtersModal = document.getElementById("filtersModal");
const filtersButton = document.getElementById("filtersButton");
const applyFiltersButton = document.getElementById("applyFiltersButton");
const clearFiltersButton = document.getElementById("clearFiltersButton");

const sizeFilterSelect = document.getElementById("sizeFilter");
const pagesFilterSelect = document.getElementById("pagesFilter");

const sortWrapper = document.getElementById("sortInlineButton");
const sortMenu = createSortDropdown();

document.body.appendChild(sortMenu);

/* ============================================================
   INITIAL DATA LOAD
============================================================ */

fetchBooks();

async function fetchBooks() {
  const url =
    "https://docs.google.com/spreadsheets/d/18X4dQ4J7RyZDvb6XJdZ-jDdzcYg8OUboOrPEw5R3OUA/gviz/tq?tqx=out:json";

  try {
    const response = await fetch(url);
    const text = await response.text();
    const json = JSON.parse(text.substring(47).slice(0, -2));

    books = json.table.rows.map(parseRow);
    filteredBooks = books;

    populateCategories();
    applyAllFilters();
  } catch (err) {
    console.error("Error loading sheet:", err);
  }
}

/* ============================================================
   PARSE GOOGLE SHEET ROW
============================================================ */

function parseRow(row) {
  const c = row.c.map((v) => (v ? v.v : ""));

  return {
    title: c[0] || "",
    author: c[1] || "",
    category: c[2] || "",
    description: c[3] || "",
    pdf: c[4] || "",
    sizeMB: Number(c[5]) || 0,
    pages: Number(c[6]) || 0,
    cover: c[7] || "",
    tags: parseTags(c[8])
  };
}

function parseTags(str) {
  if (!str) return [];
  return str.split(",").map((t) => t.trim());
}

/* ============================================================
   CATEGORY BUTTONS
============================================================ */

function populateCategories() {
  const categorySet = new Set(["all", "bookmarked"]);

  books.forEach((b) => {
    if (b.category) categorySet.add(b.category.trim());
  });

  categoriesLeft.innerHTML = "";

  categorySet.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "category-btn";
    btn.textContent = capitalize(cat);
    btn.dataset.category = cat;

    btn.addEventListener("click", () => {
      currentCategory = cat;
      highlightCategory();
      applyAllFilters();
    });

    categoriesLeft.appendChild(btn);
  });

  highlightCategory();
}

function highlightCategory() {
  document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === currentCategory);
  });
}

/* ============================================================
   FILTERS POPUP (ONLY SIZE + LENGTH)
============================================================ */

filtersButton.addEventListener("click", () => {
  openModal(filtersModal);
});

applyFiltersButton.addEventListener("click", () => {
  sizeFilter = sizeFilterSelect.value;
  pagesFilter = pagesFilterSelect.value;

  filtersButton.classList.toggle(
    "active",
    sizeFilter !== "any" || pagesFilter !== "any"
  );

  closeModal(filtersModal);
  applyAllFilters();
});

clearFiltersButton.addEventListener("click", () => {
  sizeFilter = "any";
  pagesFilter = "any";
  sizeFilterSelect.value = "any";
  pagesFilterSelect.value = "any";

  filtersButton.classList.remove("active");

  closeModal(filtersModal);
  applyAllFilters();
});

/* ============================================================
   SORT DROPDOWN (UNDER SORT ICON)
============================================================ */

function createSortDropdown() {
  const wrapper = document.createElement("div");
  wrapper.className = "sort-menu";
  wrapper.id = "sortMenu";

  const options = [
    ["relevance", "Relevance"],
    ["title", "Title (A–Z)"],
    ["author", "Author (A–Z)"],
    ["category", "Category (A–Z)"],
    ["sizeAsc", "Size (Small → Large)"],
    ["sizeDesc", "Size (Large → Small)"],
    ["pagesAsc", "Pages (Few → Many)"],
    ["pagesDesc", "Pages (Many → Few)"]
  ];

  options.forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.className = "sort-option";
    btn.dataset.value = value;
    btn.textContent = label;

    btn.addEventListener("click", () => {
      sortOption = value;
      highlightSortOption();
      applyAllFilters();
      wrapper.classList.remove("open");
    });

    wrapper.appendChild(btn);
  });

  return wrapper;
}

sortWrapper.addEventListener("click", (e) => {
  e.stopPropagation();
  sortMenu.classList.toggle("open");
});

function highlightSortOption() {
  document.querySelectorAll(".sort-option").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.value === sortOption);
  });

  sortWrapper.classList.toggle("active", sortOption !== "relevance");
}

/* close sort menu by clicking outside */
document.addEventListener("click", () => {
  sortMenu.classList.remove("open");
});

/* ============================================================
   APPLY ALL FILTERS + SORT
============================================================ */

function applyAllFilters() {
  const search = searchInput.value.trim().toLowerCase();

  filteredBooks = books.filter((b) => {
    if (currentCategory === "bookmarked" && !bookmarks.includes(b.pdf)) return false;
    if (currentCategory !== "all" && currentCategory !== "bookmarked") {
      if (b.category.toLowerCase() !== currentCategory.toLowerCase()) return false;
    }

    if (search) {
      const combined =
        b.title.toLowerCase() +
        " " +
        b.author.toLowerCase() +
        " " +
        b.category.toLowerCase() +
        " " +
        b.description.toLowerCase() +
        " " +
        b.tags.join(" ").toLowerCase();

      if (!combined.includes(search)) return false;
    }

    if (!checkSizeRule(b.sizeMB)) return false;
    if (!checkPageRule(b.pages)) return false;

    return true;
  });

  sortBooks();
  renderBooks();
}

function sortBooks() {
  filteredBooks.sort((a, b) => {
    switch (sortOption) {
      case "title":
        return a.title.localeCompare(b.title);
      case "author":
        return a.author.localeCompare(b.author);
      case "category":
        return a.category.localeCompare(b.category);
      case "sizeAsc":
        return a.sizeMB - b.sizeMB;
      case "sizeDesc":
        return b.sizeMB - a.sizeMB;
      case "pagesAsc":
        return a.pages - b.pages;
      case "pagesDesc":
        return b.pages - a.pages;
      default:
        return 0;
    }
  });

  highlightSortOption();
}

/* ============================================================
   SIZE + LENGTH RULES
============================================================ */

function checkSizeRule(mb) {
  switch (sizeFilter) {
    case "lt1":
      return mb < 1;
    case "1to100":
      return mb >= 1 && mb <= 100;
    case "100to200":
      return mb >= 100 && mb <= 200;
    case "200to500":
      return mb >= 200 && mb <= 500;
    case "500to1000":
      return mb >= 500 && mb <= 1000;
    case "gt1000":
      return mb > 1000;
    default:
      return true;
  }
}

function checkPageRule(p) {
  switch (pagesFilter) {
    case "lt100":
      return p < 100;
    case "100to200":
      return p >= 100 && p <= 200;
    case "200to500":
      return p >= 200 && p <= 500;
    case "500to1000":
      return p >= 500 && p <= 1000;
    case "1000to2000":
      return p >= 1000 && p <= 2000;
    case "gt2000":
      return p > 2000;
    default:
      return true;
  }
}

/* ============================================================
   RENDER BOOKS
============================================================ */

function renderBooks() {
  booksContainer.classList.toggle("list-view", currentView === "list");

  booksContainer.innerHTML = filteredBooks
    .map((b) => bookCardHTML(b))
    .join("");

  addCardListeners();

  resultsInfo.textContent = filteredBooks.length + " results";
}

function bookCardHTML(b) {
  return `
    <div class="book-card" data-id="${b.pdf}">
      <button class="bookmark-btn">${bookmarks.includes(b.pdf) ? "★" : "☆"}</button>

      <img class="book-cover" src="${b.cover}" />

      <div class="book-info">
        <div class="book-title">${b.title}</div>
        <div class="book-author">by ${b.author}</div>
        <div class="book-category">Category: ${b.category}</div>
        <div class="book-desc">${b.description}</div>

        <div class="book-links">
          <a href="${b.pdf}" target="_blank">
            <i class="fa-regular fa-file-pdf"></i> Get PDF
          </a>
        </div>
      </div>
    </div>
  `;
}

function addCardListeners() {
  document.querySelectorAll(".bookmark-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".book-card");
      toggleBookmark(card.dataset.id);
      btn.textContent = bookmarks.includes(card.dataset.id) ? "★" : "☆";
    });
  });

  document.querySelectorAll(".book-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      openBookModal(id);
    });
  });
}

/* ============================================================
   BOOKMARKS
============================================================ */

function toggleBookmark(id) {
  if (bookmarks.includes(id)) {
    bookmarks = bookmarks.filter((x) => x !== id);
  } else {
    bookmarks.push(id);
  }
  localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
}

/* ============================================================
   BOOK MODAL
============================================================ */

const bookModal = document.getElementById("bookModal");
const bookModalBody = bookModal.querySelector(".modal-body");

function openBookModal(id) {
  const b = books.find((x) => x.pdf === id);

  bookModalBody.innerHTML = `
    <div class="modal-book-header">
      <img class="modal-cover" src="${b.cover}" />
      <div class="modal-book-main">
        <h3>${b.title}</h3>
        <p class="modal-author-category">
          ${b.author} • ${b.category}
        </p>
      </div>
    </div>

    <div class="modal-section">
      <h4>Summary</h4>
      <p>${b.description}</p>
    </div>

    <div class="modal-section">
      <h4>File info</h4>
      <p>Format: PDF</p>
      <p>Length: ${b.pages} pages</p>
      <p>Size: ${b.sizeMB} MB</p>
    </div>

    <div class="modal-actions">
      <a class="modal-btn" href="${b.pdf}" target="_blank">
        <i class="fa-regular fa-file-pdf"></i> Get PDF
      </a>

      <button class="modal-btn" id="modalBookmarkBtn">
        <i class="fa-solid fa-bookmark"></i>
        ${bookmarks.includes(b.pdf) ? "Remove" : "Bookmark"}
      </button>
    </div>
  `;

  bookModal.classList.remove("hidden");
  document.body.classList.add("popup-open");

  document.getElementById("modalBookmarkBtn").addEventListener("click", () => {
    toggleBookmark(b.pdf);
    applyAllFilters();
    openBookModal(b.pdf);
  });
}

bookModal.querySelector(".modal-close").addEventListener("click", () => {
  closeModal(bookModal);
});

/* ============================================================
   MODAL HELPERS
============================================================ */

function openModal(modal) {
  modal.classList.remove("hidden");
  document.body.classList.add("popup-open");
}

function closeModal(modal) {
  modal.classList.add("hidden");
  document.body.classList.remove("popup-open");
}

/* click overlay to close */
document.querySelectorAll(".modal-overlay").forEach((ov) => {
  ov.addEventListener("click", () => {
    ov.parentElement.classList.add("hidden");
    document.body.classList.remove("popup-open");
  });
});

/* ============================================================
   VIEW SWITCHER
============================================================ */

document.querySelectorAll(".view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-btn").forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");

    currentView = btn.dataset.view;
    renderBooks();
  });
});

/* ============================================================
   SEARCH
============================================================ */

searchButton.addEventListener("click", applyAllFilters);
clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  applyAllFilters();
});
searchInput.addEventListener("input", applyAllFilters);

/* ============================================================
   UTILS
============================================================ */

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ============================================================
   BACK BUTTON (IMPROVED)
============================================================ */

window.addEventListener("popstate", () => {
  if (!bookModal.classList.contains("hidden")) closeModal(bookModal);
});
