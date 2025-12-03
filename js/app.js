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

/* SORTING */
const sortInlineButton = document.getElementById("sortInlineButton");
let sortMenu = null;

/* VIEW SWITCH */
const viewSwitch = document.getElementById("viewSwitch");
const viewButtons = viewSwitch
  ? viewSwitch.querySelectorAll(".view-btn")
  : [];

/* THEME */
const themeToggle = document.getElementById("themeToggle");

/* BOOK MODAL */
const bookModal = document.getElementById("bookModal");
const bookModalBody = bookModal.querySelector(".modal-body");
const bookModalClose = bookModal.querySelector(".modal-close");
const bookModalOverlay = bookModal.querySelector(".modal-overlay");

/* MOBILE NAV */
const mobileBottomNav = document.getElementById("mobileBottomNav");

/* ============================================================
   THEME TOGGLE
============================================================ */
function applyTheme(theme) {
  document.body.classList.remove("dark", "light");
  document.body.classList.add(theme);

  if (theme === "dark") {
    themeToggle.innerHTML = `<i class="fa-regular fa-moon"></i>`;
  } else {
    themeToggle.innerHTML = `<i class="fa-regular fa-sun"></i>`;
  }
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

/* ============================================================
   FUZZY SEARCH HELPERS
============================================================ */
function levenshteinDistance(a, b) {
  a = (a || "").toString();
  b = (b || "").toString();
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) {
    dp[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1,      // deletion
        dp[j - 1] + 1,  // insertion
        prev + cost     // substitution
      );
      prev = temp;
    }
  }

  return dp[n];
}

function fuzzyMatch(text, query) {
  const t = norm(text);
  const q = norm(query);

  if (!q) return true;
  if (t.includes(q)) return true;

  const tWords = t.split(/\s+/).filter(Boolean);
  const qWords = q.split(/\s+/).filter(Boolean);
  if (!tWords.length || !qWords.length) return false;

  const maxDist = q.length <= 4 ? 1 : 2;

  return qWords.some((qw) =>
    tWords.some((tw) => levenshteinDistance(tw, qw) <= maxDist)
  );
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
    ? rawTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  b.sizeMB = row.sizeMB ? Number(row.sizeMB) : null;
  b.pages = row.pages ? Number(row.pages) : null;

  b.language = row.language?.trim() || "";
  b.year = row.year?.trim() || "";

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

categoriesButton.addEventListener("click", (e) => {
  e.stopPropagation();
  openCategoriesPopup();
});
categoriesClose.addEventListener("click", closeCategoriesPopup);
categoriesOverlay.addEventListener("click", closeCategoriesPopup);

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
  const val = searchPopupInput.value.trim();
  currentSearch = val;
  searchInput.value = val;
  renderBooks();
  closeSearchPopup();
  if (val) {
    setHash("#search=" + encodeURIComponent(val));
  } else if (currentCategory !== "all") {
    setHash("#category=" + encodeURIComponent(currentCategory));
  } else {
    setHash("#all");
  }
});

/* ============================================================
   SORTING
============================================================ */
function initSortMenu() {
  if (!sortInlineButton) return;

  sortInlineButton.addEventListener("click", (e) => {
    e.stopPropagation();
    if (sortMenu) {
      sortMenu.classList.toggle("open");
      return;
    }

    sortMenu = document.createElement("div");
    sortMenu.className = "sort-menu";

    const header = document.createElement("div");
    header.className = "sort-menu-header";
    header.textContent = "Sort by";
    sortMenu.appendChild(header);

    const opts = [
      ["relevance", "Relevance"],
      ["title", "Title A → Z"],
      ["author", "Author A → Z"],
      ["category", "Category A → Z"],
      ["sizeAsc", "File Size ↑"],
      ["sizeDesc", "File Size ↓"],
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

    document.body.appendChild(sortMenu);

    const rect = sortInlineButton.getBoundingClientRect();
    sortMenu.style.position = "fixed";
    sortMenu.style.top = rect.bottom + 6 + "px";
    sortMenu.style.right = Math.max(
      10,
      window.innerWidth - rect.right - 10
    ) + "px";

    updateSortActive();
  });

  document.addEventListener("click", () => {
    if (sortMenu) sortMenu.classList.remove("open");
  });

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
   SEARCH INPUT (TOP BAR)
============================================================ */
function performSearchFromInput() {
  const val = searchInput.value.trim();
  currentSearch = val;
  renderBooks();

  if (val) {
    setHash("#search=" + encodeURIComponent(val));
  } else if (currentCategory !== "all") {
    setHash("#category=" + encodeURIComponent(currentCategory));
  } else {
    setHash("#all");
  }
}

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    performSearchFromInput();
  }
});
searchButton.addEventListener("click", performSearchFromInput);

clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  currentSearch = "";
  renderBooks();

  if (currentCategory !== "all") {
    setHash("#category=" + encodeURIComponent(currentCategory));
  } else {
    setHash("#all");
  }
});

/* ============================================================
   TOP CATEGORY BUTTONS (ALL / BOOKMARKED)
============================================================ */
btnAll.addEventListener("click", () => {
  currentCategory = "all";
  currentSearch = "";
  searchInput.value = "";
  updateTopButtons();
  renderBooks();
  setHash("#all");
});

btnBookmarked.addEventListener("click", () => {
  currentCategory = "bookmarked";
  currentSearch = "";
  searchInput.value = "";
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
    categoriesButton.textContent = "Category ▼";
  } else if (currentCategory === "bookmarked") {
    btnBookmarked.classList.add("active");
    categoriesButton.textContent = "Category ▼";
  } else {
    categoriesButton.classList.add("active");
    categoriesButton.textContent = currentCategory;
  }
}

/* ============================================================
   VIEW SWITCH (GRID / LIST)
============================================================ */
viewButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    currentView = view;

    viewButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderBooks();
  });
});

/* ============================================================
   MOBILE BOTTOM NAV
============================================================ */
if (mobileBottomNav) {
  const navButtons = mobileBottomNav.querySelectorAll("button[data-nav]");

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nav = btn.dataset.nav;

      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (nav === "home") {
        document
          .getElementById("search")
          .scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (nav === "bookmarks") {
        currentCategory = "bookmarked";
        currentSearch = "";
        searchInput.value = "";
        updateTopButtons();
        renderBooks();
        setHash("#bookmarks");
      } else if (nav === "categories") {
        openCategoriesPopup();
      } else if (nav === "search") {
        openSearchPopup();
      }
    });
  });
}

/* ============================================================
   GET FILTERED BOOKS  (uses fuzzy search now)
============================================================ */
function getFilteredBooks() {
  let arr = books.filter((b) => {
    if (currentCategory === "bookmarked") {
      if (!bookmarks.includes(b.title)) return false;
    } else if (currentCategory !== "all") {
      if (norm(b.category) !== norm(currentCategory)) return false;
    }

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
      if (!fuzzyMatch(text, currentSearch)) return false;
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
        <div class="book-category">Category: ${b.category}</div>

        <div class="book-meta">
          ${
            b.sizeMB
              ? `<span><i class="fa-solid fa-file"></i> ${b.sizeMB} MB</span>`
              : ""
          }
          ${
            b.pages
              ? `<span><i class="fa-solid fa-book-open"></i> ${b.pages} pages</span>`
              : ""
          }
          ${
            b.language
              ? `<span><i class="fa-solid fa-language"></i> ${b.language}</span>`
              : ""
          }
          ${
            b.year
              ? `<span><i class="fa-regular fa-calendar"></i> ${b.year}</span>`
              : ""
          }
        </div>

        ${
          b.tags && b.tags.length
            ? `<div class="book-tags">
                 ${b.tags
                   .map((t) => `<span class="tag-chip">${t}</span>`)
                   .join("")}
               </div>`
            : ""
        }

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
   BOOK POPUP
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

    ${
      b.details
        ? `<div class="modal-section"><h4>Details</h4><p>${b.details}</p></div>`
        : ""
    }

    <div class="modal-actions">
      <a href="${b.pdfUrl}" target="_blank" class="modal-btn">
        <i class="fa-solid fa-file-pdf"></i> Get PDF
      </a>
      <button id="popupBookmark" class="modal-btn">
        ${
          bookmarks.includes(b.title)
            ? '<i class="fa-solid fa-star"></i> Remove Bookmark'
            : '<i class="fa-regular fa-star"></i> Add Bookmark'
        }
      </button>
    </div>
  `;

  bookModal.classList.remove("hidden");
  document.body.classList.add("popup-open");

  const popupBookmarkBtn = document.getElementById("popupBookmark");
  popupBookmarkBtn.addEventListener("click", () => {
    toggleBookmark(b.title);
    openBookPopup(b); // re-render popup with updated bookmark state
  });
}

function closeBookPopup() {
  bookModal.classList.add("hidden");
  document.body.classList.remove("popup-open");
}

bookModalClose.addEventListener("click", closeBookPopup);
bookModalOverlay.addEventListener("click", closeBookPopup);

/* ============================================================
   URL HASH HANDLING
============================================================ */
function applyHashFromLocation() {
  const hash = window.location.hash.slice(1); // remove #

  if (!hash || hash === "all") {
    currentCategory = "all";
    currentSearch = "";
    searchInput.value = "";
    updateTopButtons();
    renderBooks();
    return;
  }

  if (hash === "bookmarks") {
    currentCategory = "bookmarked";
    currentSearch = "";
    searchInput.value = "";
    updateTopButtons();
    renderBooks();
    return;
  }

  if (hash.startsWith("category=")) {
    const cat = decodeURIComponent(hash.slice("category=".length));
    currentCategory = cat || "all";
    currentSearch = "";
    searchInput.value = "";
    updateTopButtons();
    renderBooks();
    return;
  }

  if (hash.startsWith("search=")) {
    const q = decodeURIComponent(hash.slice("search=".length));
    currentCategory = "all";
    currentSearch = q || "";
    searchInput.value = q || "";
    updateTopButtons();
    renderBooks();
    return;
  }

  if (hash.startsWith("book=")) {
    const fileName = decodeURIComponent(hash.slice("book=".length));

    // find book by matching filename only
    const book = books.find((b) => b.pdfUrl.split("/").pop() === fileName);

    if (book) {
      renderBooks();
      openBookPopup(book);
      return;
    } else {
      currentCategory = "all";
      currentSearch = "";
      searchInput.value = "";
      updateTopButtons();
      renderBooks();
      return;
    }
  }

  // unknown hash → default to all
  currentCategory = "all";
  updateTopButtons();
  renderBooks();
}

window.addEventListener("hashchange", applyHashFromLocation);

/* ============================================================
   INIT
============================================================ */
loadBooks();
initSortMenu();
