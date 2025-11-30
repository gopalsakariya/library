/* ============================================
   1. GOOGLE SHEET CONFIG & BOOK STORAGE
============================================ */

// Your Google Sheet ID
const SHEET_ID = "18X4dQ4J7RyZDvb6XJdZ-jDdzcYg8OUboOrPEw5R3OUA";
const SHEET_TAB = "Sheet1";
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;

// Books stored here
document.body.classList.add("dark");

const books = [];

/* Cover helper: supports URLs and local paths */
function getCoverPath(rawCover) {
  let cover = (rawCover || "").trim();

  // If empty, use placeholder
  if (!cover) {
    return "img/default-cover.png";
  }

  // If looks like an URL (http, https)
  if (/^https?:\/\//i.test(cover)) {
    return cover;
  }

  // Otherwise assume img subfolder
  return `img/${cover}`;
}

/* Mapping from sheet row => book object used in app */
function mapRowToBook(row) {
  return {
    title: (row["Title"] || "").trim(),
    author: (row["Author"] || "").trim(),
    category: (row["Category"] || "Uncategorized").trim(),
    description: (row["Description"] || "").trim(),
    details: (row["Details"] || "").trim(),
    tags: (row["Tags"] || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    pdfUrl: (row["PDF"] || "").trim(),
    cover: getCoverPath(row["Cover"]),
  };
}

/* ============================================
   2. DOM ELEMENTS
============================================ */

const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");

const resultsInfo = document.getElementById("resultsInfo");
const booksContainer = document.getElementById("booksContainer");

const paginationControls = document.getElementById("paginationControls");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");

const categoryRow = document.getElementById("categories");

const bookModal = document.getElementById("bookModal");
const modalOverlay = bookModal.querySelector(".modal-overlay");
const modalClose = bookModal.querySelector(".modal-close");
const modalBody = bookModal.querySelector(".modal-body");

const categoryModal = document.getElementById("categoryModal");
const categoryModalOverlay = categoryModal.querySelector(".modal-overlay");
const categoryModalClose = categoryModal.querySelector(".modal-close");
const categoryList = document.querySelector(".category-list");

const searchOverlay = document.getElementById("searchOverlay");
const searchOverlayInput = document.getElementById("searchOverlayInput");
const searchOverlayClose = document.getElementById("searchOverlayClose");

const mobileBottomNav = document.querySelector(".mobile-bottom-nav");
const navButtons = mobileBottomNav.querySelectorAll("button");

/* ============================================
   3. STATE: FILTERS, PAGINATION, BOOKMARKS
============================================ */

let currentCategory = "home";
let currentSort = "relevance";
let currentPage = 1;
const PAGE_SIZE = 12;

let bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");

/* Filters: search query from main input */
function getSearchQuery() {
  return (searchInput.value || "").trim().toLowerCase();
}

/* Utility: check if a book is bookmarked */
function isBookBookmarked(book) {
  return bookmarks.includes(book.title);
}

/* Toggle bookmark - by title */
function toggleBookmark(title) {
  const index = bookmarks.indexOf(title);
  if (index === -1) {
    bookmarks.push(title);
  } else {
    bookmarks.splice(index, 1);
  }

  localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
  renderBooks(); // re-render to update icons
}

/* ============================================
   4. FETCH & CACHE BOOKS
============================================ */

function cacheBooks(data) {
  localStorage.setItem(
    "booksCache",
    JSON.stringify({
      timestamp: Date.now(),
      data,
    })
  );
}

function loadCachedBooks() {
  try {
    const cached = JSON.parse(localStorage.getItem("booksCache") || "null");
    if (!cached || !Array.isArray(cached.data)) return null;
    return cached.data;
  } catch {
    return null;
  }
}

/* Load books from sheet, with caching and fallback */
async function loadBooks() {
  // Try cache first
  const cached = loadCachedBooks();
  if (cached) {
    books.length = 0;
    books.push(...cached.map(mapRowToBook));
    renderAll();
  } else {
    // Show loading state
    booksContainer.innerHTML = "<p>Loading books...</p>";
  }

  // Always attempt fresh fetch
  try {
    const response = await fetch(SHEET_URL);
    if (!response.ok) throw new Error("Network response not ok");
    const rows = await response.json();
    const mapped = rows.map(mapRowToBook);

    books.length = 0;
    books.push(...mapped);

    cacheBooks(mapped);
    renderAll();
  } catch (error) {
    console.error("Failed to fetch data from sheet:", error);
    if (!cached) {
      booksContainer.innerHTML =
        "<p>Failed to load books. Please check your connection and refresh.</p>";
    }
  }
}

/* ============================================
   5. FILTERS, SORTING, PAGINATION
============================================ */

function scoreBookForSearch(book, query) {
  if (!query) return 1; // no search => equal baseline

  const title = book.title.toLowerCase();
  const author = book.author.toLowerCase();
  const category = book.category.toLowerCase();
  const description = (book.description || "").toLowerCase();
  const tags = (book.tags || []).map((t) => t.toLowerCase());

  let score = 0;

  // Strong match: title
  if (title.includes(query)) score += 5;
  // Author
  if (author.includes(query)) score += 3;
  // Category
  if (category.includes(query)) score += 2;
  // Tags
  tags.forEach((t) => {
    if (t.includes(query)) score += 2;
  });
  // Description
  if (description.includes(query)) score += 1;

  return score;
}

/* Return filtered + sorted array of books according to current state */
function getFilteredBooks() {
  const query = getSearchQuery();

  let filtered = books.slice();

  // Filter by category
  if (currentCategory === "bookmarked") {
    filtered = filtered.filter(isBookBookmarked);
  } else if (currentCategory !== "home") {
    filtered = filtered.filter(
      (b) => b.category.toLowerCase() === currentCategory.toLowerCase()
    );
  }

  // Compute search score
  const scored = filtered.map((book) => ({
    book,
    score: scoreBookForSearch(book, query),
  }));

  // Filter out score 0 if query is non-empty
  const effective = query
    ? scored.filter((item) => item.score > 0)
    : scored;

  // Sort according to currentSort
  effective.sort((a, b) => {
    if (currentSort === "title") {
      return a.book.title.localeCompare(b.book.title);
    }
    if (currentSort === "author") {
      return a.book.author.localeCompare(b.book.author);
    }
    if (currentSort === "category") {
      return a.book.category.localeCompare(b.book.category);
    }

    // Relevance: sort by score desc, fallback to title asc
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.book.title.localeCompare(b.book.title);
  });

  return effective.map((item) => item.book);
}

/* Pagination: returns subset for currentPage */
function getPagedBooks(allBooks) {
  const total = allBooks.length;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (currentPage > maxPage) currentPage = maxPage;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = allBooks.slice(start, end);

  return { pageItems, total, maxPage };
}

/* ============================================
   6. RENDERING FUNCTIONS
============================================ */

/* Render categories row, including "All" and "Bookmarked" */
function renderCategories() {
  const categories = new Set();
  books.forEach((book) => {
    if (book.category) {
      categories.add(book.category.trim());
    }
  });

  // Clear
  categoryRow.innerHTML = "";

  // "All" chip
  const allBtn = document.createElement("button");
  allBtn.className = "category-btn" + (currentCategory === "home" ? " active" : "");
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    currentCategory = "home";
    currentPage = 1;
    renderAll();
  });
  categoryRow.appendChild(allBtn);

  // "Bookmarked" chip
  const bookmarkedBtn = document.createElement("button");
  bookmarkedBtn.className =
    "category-btn" + (currentCategory === "bookmarked" ? " active" : "");
  bookmarkedBtn.innerHTML =
    '<i class="fa-solid fa-bookmark"></i> Bookmarked';
  bookmarkedBtn.addEventListener("click", () => {
    currentCategory = "bookmarked";
    currentPage = 1;
    renderAll();
  });
  categoryRow.appendChild(bookmarkedBtn);

  // Category chips
  Array.from(categories)
    .sort((a, b) => a.localeCompare(b))
    .forEach((cat) => {
      const btn = document.createElement("button");
      btn.className =
        "category-btn" + (currentCategory === cat.toLowerCase() ? " active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        currentCategory = cat.toLowerCase();
        currentPage = 1;
        renderAll();
      });
      categoryRow.appendChild(btn);
    });
}

/* Render list of books into #booksContainer */
function renderBooks() {
  const filtered = getFilteredBooks();
  const { pageItems, total, maxPage } = getPagedBooks(filtered);

  booksContainer.innerHTML = "";

  if (total === 0) {
    booksContainer.innerHTML = "<p>No books found. Try a different search.</p>";
    paginationControls.classList.add("hidden");
    return;
  }

  // Show pagination if more than one page
  if (maxPage > 1) {
    paginationControls.classList.remove("hidden");
  } else {
    paginationControls.classList.add("hidden");
  }

  // Update pagination controls
  pageInfo.textContent = `Page ${currentPage} of ${maxPage}`;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === maxPage;

  // Create book cards
  pageItems.forEach((book) => {
    const card = document.createElement("article");
    card.className = "book-card";

    const isBookmarked = isBookBookmarked(book);
    const bookmarkIcon = isBookmarked ? "fa-solid" : "fa-regular";

    card.innerHTML = `
      <button class="bookmark-btn" type="button" onclick="toggleBookmark('${book.title.replace(
        /'/g,
        "\\'"
      )}')">
        <i class="${bookmarkIcon} fa-bookmark"></i>
      </button>

      <img src="${book.cover}" alt="Cover of ${book.title}" class="book-cover" />

      <div class="book-info">
        <h3>${book.title}</h3>
        <div class="book-meta">
          ${book.author || "Unknown author"} · ${book.category || "Uncategorized"}
        </div>
        <div class="book-description">
          ${book.description || "No description available."}
        </div>
        <div class="book-details">
          ${book.details || ""}
        </div>
        <div class="book-tags">
          ${(book.tags || [])
            .map((tag) => `<span class="book-tag">${tag}</span>`)
            .join("")}
        </div>
        <div class="book-actions">
          <button class="book-read-btn" type="button">
            <i class="fa-solid fa-book-open-reader"></i> Read
          </button>
        </div>
      </div>
    `;

    // Card click => open modal
    card.addEventListener("click", (event) => {
      if (event.target.closest(".bookmark-btn")) return;
      if (event.target.closest(".book-read-btn")) return;
      openBookModal(book);
    });

    // Read button => open PDF
    const readBtn = card.querySelector(".book-read-btn");
    readBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openPdf(book.pdfUrl);
    });

    booksContainer.appendChild(card);
  });

  // Update results info
  const query = getSearchQuery();
  let baseText = `${filtered.length} book${
    filtered.length !== 1 ? "s" : ""
  } found`;

  if (query) {
    baseText += ` for “${query}”`;
  }

  if (currentCategory === "bookmarked") {
    baseText += " in your bookmarks";
  } else if (currentCategory !== "home") {
    baseText += ` in “${currentCategory}”`;
  }

  resultsInfo.textContent = baseText;
}

/* Render category modal list */
function renderCategoryModal() {
  if (!categoryList) return;

  const categories = new Set();
  books.forEach((book) => {
    if (book.category) {
      categories.add(book.category.trim());
    }
  });

  categoryList.innerHTML = "";

  Array.from(categories)
    .sort((a, b) => a.localeCompare(b))
    .forEach((cat) => {
      const badge = document.createElement("button");
      badge.className = "category-badge";
      badge.textContent = cat;
      badge.addEventListener("click", () => {
        currentCategory = cat.toLowerCase();
        currentPage = 1;
        closeCategoryModal();
        renderAll();
      });
      categoryList.appendChild(badge);
    });
}

/* ============================================
   7. MODAL & NAVIGATION HELPERS
============================================ */

function openBookModal(book) {
  if (!book) return;

  const coverEl = bookModal.querySelector(".modal-cover");
  const titleEl = bookModal.querySelector("h2");
  const metaEl = bookModal.querySelector(".modal-meta");
  const descEl = bookModal.querySelector(".modal-description");
  const detailsEl = bookModal.querySelector(".modal-details");
  const tagsEl = bookModal.querySelector(".modal-tags");

  coverEl.src = book.cover;
  coverEl.alt = `Cover of ${book.title}`;
  titleEl.textContent = book.title;
  metaEl.textContent = `${book.author || "Unknown author"} · ${
    book.category || "Uncategorized"
  }`;
  descEl.textContent = book.description || "No description available.";
  detailsEl.textContent = book.details || "";

  tagsEl.innerHTML = "";
  (book.tags || []).forEach((tag) => {
    const span = document.createElement("span");
    span.className = "modal-tag";
    span.textContent = tag;
    tagsEl.appendChild(span);
  });

  const readBtn = bookModal.querySelector(".modal-read-btn");
  const downloadBtn = bookModal.querySelector(".modal-download-btn");

  readBtn.onclick = () => openPdf(book.pdfUrl);
  downloadBtn.onclick = () => openPdf(book.pdfUrl, true);

  openModal(bookModal);
}

function openModal(modalEl) {
  modalEl.classList.add("open");
  document.body.classList.add("popup-open");
  history.pushState({ popup: true }, ""); // track for back button
}

function closeModal(modalEl) {
  modalEl.classList.remove("open");
  document.body.classList.remove("popup-open");
}

/* Specific modals */

function closeBookModal() {
  closeModal(bookModal);
}

function closeCategoryModal() {
  closeModal(categoryModal);
}

function openCategoryModal() {
  categoryModal.classList.add("open");
  document.body.classList.add("popup-open");
  history.pushState({ popup: true }, "");
}

/* ============================================
   8. SEARCH OVERLAY (MOBILE)
============================================ */

function openSearchOverlay() {
  searchOverlay.classList.add("open");
  document.body.classList.add("popup-open");
  searchOverlayInput.value = searchInput.value;
  searchOverlayInput.focus();
  history.pushState({ popup: true }, "");
}

function closeSearchOverlay() {
  searchOverlay.classList.remove("open");
  document.body.classList.remove("popup-open");
}

/* Sync overlay search with main input */
searchOverlayInput.addEventListener("input", () => {
  searchInput.value = searchOverlayInput.value;
  currentPage = 1;
  renderAll();
});

searchOverlayClose.addEventListener("click", () => {
  closeSearchOverlay();
});

/* ============================================
   9. OPEN PDF
============================================ */

function openPdf(url, download = false) {
  if (!url) {
    alert("No PDF URL available for this book.");
    return;
  }
  if (download) {
    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    link.target = "_blank";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/* ============================================
   10. EVENT WIRING
============================================ */

/* Search bar events */
searchButton.addEventListener("click", () => {
  currentPage = 1;
  renderAll();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    currentPage = 1;
    renderAll();
  }
});

clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  currentPage = 1;
  renderAll();
});

/* Pagination buttons */
prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage -= 1;
    renderAll();
  }
});

nextPageBtn.addEventListener("click", () => {
  currentPage += 1;
  renderAll();
});

/* Category modal open from bottom nav button */
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-nav");
    setActiveNav(target);
  });
});

function setActiveNav(target) {
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-nav") === target);
  });

  if (target === "home") {
    currentCategory = "home";
    currentPage = 1;
    renderAll();
  } else if (target === "categories") {
    openCategoryModal();
  } else if (target === "bookmarks") {
    currentCategory = "bookmarked";
    currentPage = 1;
    renderAll();
  } else if (target === "search") {
    openSearchOverlay();
  }
}

/* Modal close buttons & overlay clicks */
modalOverlay.addEventListener("click", closeBookModal);
modalClose.addEventListener("click", closeBookModal);

categoryModalOverlay.addEventListener("click", closeCategoryModal);
categoryModalClose.addEventListener("click", closeCategoryModal);

/* ESC key handling */
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (searchOverlay.classList.contains("open")) {
      closeSearchOverlay();
      return;
    }
    if (bookModal.classList.contains("open")) {
      closeBookModal();
      return;
    }
    if (categoryModal.classList.contains("open")) {
      closeCategoryModal();
    }
  }
});

/* ============================================
   11. SCROLL HEADER BEHAVIOR
============================================ */

let lastScrollY = window.scrollY;
const header = document.querySelector("header");

window.addEventListener("scroll", () => {
  const currentY = window.scrollY;

  if (currentY > lastScrollY && currentY > 80) {
    header.classList.add("header-hidden");
  } else {
    header.classList.remove("header-hidden");
  }

  lastScrollY = currentY;
});

/* ============================================
   12. BACK BUTTON NAVIGATION
============================================ */

function isAnyPopupOpen() {
  return (
    searchOverlay.classList.contains("open") ||
    bookModal.classList.contains("open") ||
    categoryModal.classList.contains("open")
  );
}

function handleBackNavigation() {
  if (searchOverlay.classList.contains("open")) {
    closeSearchOverlay();
    return;
  }

  if (bookModal.classList.contains("open")) {
    closeBookModal();
    return;
  }

  if (categoryModal.classList.contains("open")) {
    closeCategoryModal();
    return;
  }

  if (currentCategory !== "home") {
    currentCategory = "home";
    currentPage = 1;
    renderAll();
    setActiveNav("home");
    return;
  }

  const confirmExit = confirm("Do you want to leave the library app?");
  if (confirmExit) {
    history.back();
  } else {
    history.pushState(null, "");
  }
}

window.addEventListener("popstate", () => {
  if (isAnyPopupOpen()) {
    handleBackNavigation();
  }
});

/* ============================================
   13. INITIAL RENDER
============================================ */

function renderAll() {
  renderCategories();
  renderBooks();
  renderCategoryModal();
}

loadBooks();
