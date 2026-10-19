/* SKILL2EARN — FRONTEND APPLICATION */
(() => {
  "use strict";

  const API_BASE = "http://127.0.0.1:5501/api";

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const keys = {
    user: "s2e_user",
    posts: "s2e_local_posts",
    saved: "s2e_saved_posts"
  };

  let currentUser = null;
  let allPosts = [];
  let localPosts = readJSON(keys.posts, []);
  let savedPosts = readJSON(keys.saved, []);
  let apiAvailable = false;

  /* =========================
     LOCAL STORAGE
  ========================= */

  function readJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* =========================
     SECURITY AND UTILITIES
  ========================= */

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function postId(post) {
    return String(post.id ?? post.post_id ?? post._id ?? "");
  }

  function postAuthor(post) {
    return (
      post.author_name ||
      post.author ||
      post.username ||
      post.user_name ||
      "Community member"
    );
  }

  function postContent(post) {
    return post.content || post.text || post.body || post.title || "";
  }

  function postLikes(post) {
    return Number(
      post.likes_count ??
      post.likes ??
      post.like_count ??
      0
    );
  }

  function isMine(post) {
    return (
      postAuthor(post).toLowerCase() ===
      String(currentUser?.name || "").toLowerCase()
    );
  }

  function showToast(message) {
    const container = $("#toastContainer");

    if (!container) {
      console.log(message);
      return;
    }

    const toast = document.createElement("div");

    toast.className = "toast-message";
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3200);
  }

  /* =========================
     USER PROFILE
  ========================= */

  function setUser(name) {
    currentUser = {
      name: name.trim() || "Skill2Earn Member"
    };

    saveJSON(keys.user, currentUser);

    const initial = currentUser.name.charAt(0).toUpperCase();

    [
      "#topAvatar",
      "#sidebarAvatar",
      "#composerAvatar",
      "#profileAvatar"
    ].forEach(selector => {
      const element = $(selector);

      if (element) {
        element.textContent = initial;
      }
    });

    [
      "#sidebarName",
      "#profileName"
    ].forEach(selector => {
      const element = $(selector);

      if (element) {
        element.textContent = currentUser.name;
      }
    });

    const nameInput = $("#editName");

    if (nameInput) {
      nameInput.value = currentUser.name;
    }

    const welcome = $("#welcomeScreen");
    const layout = $("#appLayout");

    if (welcome) {
      welcome.classList.add("hidden");
    }

    if (layout) {
      layout.classList.remove("hidden");
    }

    updateProfileStats();
  }

  /* =========================
     PAGE NAVIGATION
  ========================= */

  function navigate(page) {
    $$(".page-section").forEach(section => {
      section.classList.toggle(
        "active",
        section.id === `page-${page}`
      );
    });

    $$(".nav-link[data-page]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });

    if (
      page === "community" ||
      page === "home" ||
      page === "discover" ||
      page === "profile"
    ) {
      loadPosts();
    }

    if (page === "profile") {
      renderProfilePosts();
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

    const menu = $(".top-actions");

    if (menu) {
      menu.classList.remove("mobile-menu-open");
    }
  }

  /* =========================
     BACKEND CONNECTION
  ========================= */

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,

      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");

      throw new Error(
        message || `Request failed (${response.status})`
      );
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  /* =========================
     LOAD ALL COMMUNITY POSTS
  ========================= */

  async function loadPosts() {
    const status = $("#communityPostsStatus");

    try {
      const result = await apiRequest(
        "/posts?skip=0&limit=100"
      );

      const serverPosts = Array.isArray(result)
        ? result
        : (
            result.posts ||
            result.items ||
            result.data ||
            []
          );

      allPosts = [...serverPosts, ...localPosts];

      apiAvailable = true;

      if (status) {
        status.textContent =
          `${allPosts.length} post` +
          `${allPosts.length === 1 ? "" : "s"} in the community`;
      }

    } catch (error) {
      apiAvailable = false;

      allPosts = [...localPosts];

      if (status) {
        status.textContent = localPosts.length
          ? "Showing posts saved in this browser. Connect the backend to see posts from other users."
          : "The community server is not connected yet.";
      }
    }

    renderAllFeeds();
  }

  /* =========================
     RENDER ALL FEEDS
  ========================= */

  function renderAllFeeds() {
    renderFeed($("#feedList"), allPosts, "home");

    renderFeed(
      $("#discoverFeed"),
      allPosts,
      "discover"
    );

    renderFeed(
      $("#communityFeed"),
      allPosts,
      "community"
    );

    renderProfilePosts();

    updateProfileStats();
  }

  /* =========================
     DISPLAY POSTS
  ========================= */

  function renderFeed(container, posts, context) {
    if (!container) return;

    let filtered = [...posts];

    if (context === "discover") {
      const query = (
        $("#discoverSearch")?.value ||
        $("#globalSearch")?.value ||
        ""
      ).trim().toLowerCase();

      if (query) {
        filtered = filtered.filter(post =>
          `${postContent(post)} ${postAuthor(post)} ${post.category || ""}`
            .toLowerCase()
            .includes(query)
        );
      }
    }

    if (context === "home") {
      const query = (
        $("#globalSearch")?.value || ""
      ).trim().toLowerCase();

      if (query) {
        filtered = filtered.filter(post =>
          `${postContent(post)} ${postAuthor(post)} ${post.category || ""}`
            .toLowerCase()
            .includes(query)
        );
      }
    }

    const sort =
      context === "community"
        ? ($("#communityFeedSort")?.value || "latest")
        : ($("#feedSort")?.value || "latest");

    if (sort === "popular") {
      filtered.sort(
        (a, b) => postLikes(b) - postLikes(a)
      );
    } else {
      filtered.sort(
        (a, b) => dateValue(b) - dateValue(a)
      );
    }

    if (!filtered.length) {
      const isCommunity = context === "community";

      container.innerHTML = `
        <div class="community-empty-state">
          <i class="fa-solid ${
            isCommunity
              ? "fa-users"
              : "fa-feather-pointed"
          }"></i>

          <h3>${
            isCommunity
              ? "No community posts to show yet"
              : "Nothing here yet"
          }</h3>

          <p>${
            isCommunity
              ? (
                  apiAvailable
                    ? "Be the first to share something useful with the community."
                    : "Start the backend server and publish posts to see posts from other users here."
                )
              : "Try another search, or create a post to get the conversation started."
          }</p>
        </div>
      `;

      return;
    }

    container.innerHTML = filtered
      .map(post => postCard(post))
      .join("");
  }

  /* =========================
     POST DATES
  ========================= */

  function dateValue(post) {
    const value =
      post.created_at ||
      post.createdAt ||
      post.timestamp ||
      post.date;

    const parsed = value
      ? new Date(value).getTime()
      : 0;

    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatDate(post) {
    const value =
      post.created_at ||
      post.createdAt ||
      post.timestamp ||
      post.date;

    if (!value) {
      return "Just now";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Recently";
    }

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  /* =========================
     POST MEDIA
  ========================= */

  function postMedia(post) {
    const url =
      post.media_url ||
      post.file_url ||
      post.image_url ||
      post.media ||
      post.file ||
      "";

    if (typeof url !== "string" || !url) {
      return "";
    }

    const fullURL = url.startsWith("http")
      ? url
      : `http://127.0.0.1:5501${
          url.startsWith("/") ? "" : "/"
        }${url}`;

    const safeURL = escapeHTML(fullURL);

    const type = (
      post.media_type ||
      post.file_type ||
      ""
    ).toLowerCase();

    if (
      type.includes("video") ||
      /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
    ) {
      return `
        <div class="post-media">
          <video
            src="${safeURL}"
            controls
            preload="metadata">
          </video>
        </div>
      `;
    }

    return `
      <div class="post-media">
        <img
          src="${safeURL}"
          alt="Post attachment"
          loading="lazy"
          onerror="this.parentElement.remove()">
      </div>
    `;
  }

  /* =========================
     POST CARD
  ========================= */

  function postCard(post) {
    const id = postId(post);
    const author = postAuthor(post);
    const content = postContent(post);

    const category =
      post.category ||
      post.tag ||
      "Community";

    const likedByMe =
      Array.isArray(post.liked_by) &&
      post.liked_by.includes(currentUser?.name);

    const saved = savedPosts
      .map(String)
      .includes(id);

    const ownerMenu =
      isMine(post) && id
        ? `
          <button
            class="post-menu-button"
            data-delete-post="${escapeHTML(id)}"
            title="Delete your post">

            <i class="fa-regular fa-trash-can"></i>
          </button>
        `
        : "";

    const commentsCount = Number(
      post.comments_count ??
      (
        Array.isArray(post.comments)
          ? post.comments.length
          : 0
      )
    );

    return `
      <article
        class="post-card"
        data-post-id="${escapeHTML(id)}">

        <div class="post-header">

          <div class="post-avatar">
            ${escapeHTML(author.charAt(0).toUpperCase())}
          </div>

          <div class="post-user-info">
            <h3>${escapeHTML(author)}</h3>
            <p>${escapeHTML(formatDate(post))}</p>
          </div>

          ${ownerMenu}

        </div>

        <span class="post-category">
          ${escapeHTML(category)}
        </span>

        <div class="post-content">
          ${escapeHTML(content)}
        </div>

        ${postMedia(post)}

        <div class="post-stats">

          <span class="post-stats-left">
            <span class="like-dot">
              <i class="fa-solid fa-heart"></i>
            </span>

            ${postLikes(post)} likes
          </span>

          <span>
            ${commentsCount} comments
          </span>

        </div>

        <div class="post-actions">

          <button
            class="post-action ${likedByMe ? "liked" : ""}"
            data-like-post="${escapeHTML(id)}">

            <i class="fa-regular fa-heart"></i>
            Like
          </button>

          <button
            class="post-action"
            data-comment-post="${escapeHTML(id)}">

            <i class="fa-regular fa-comment"></i>
            Comment
          </button>

          <button
            class="post-action"
            data-save-post="${escapeHTML(id)}">

            <i class="fa-${
              saved ? "solid" : "regular"
            } fa-bookmark"></i>

            ${saved ? "Saved" : "Save"}
          </button>

        </div>

      </article>
    `;
  }

  /* =========================
     CREATE A POST
  ========================= */

  async function publishPost(event) {
    event.preventDefault();

    const textarea = $("#postText");
    const message = $("#postMessage");

    const content = textarea?.value.trim();

    if (!content) {
      if (message) {
        message.textContent =
          "Write something before publishing.";
      }

      return;
    }

    const submit = $(
      "#postForm button[type='submit']"
    );

    if (submit) {
      submit.disabled = true;
    }

    const category =
      $("#postText").dataset.category ||
      "Community";

    const payload = {
      content,
      author_name:
        currentUser?.name ||
        "Community member",
      category
    };

    try {
      const created = await apiRequest(
        "/posts",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

      if (created && typeof created === "object") {
        localPosts = localPosts.filter(
          post => postContent(post) !== content
        );
      }

      showToast("Your post has been published!");

      if (message) {
        message.textContent = "Published successfully.";
      }

    } catch (error) {
      const localPost = {
        id: `local-${Date.now()}`,
        ...payload,
        created_at: new Date().toISOString(),
        likes_count: 0
      };

      localPosts.unshift(localPost);

      saveJSON(keys.posts, localPosts);

      showToast(
        "Saved on this browser. Connect the backend to share it with everyone."
      );

      if (message) {
        message.textContent =
          "Saved locally on this device; it is not visible to other users yet.";
      }

    } finally {
      if (submit) {
        submit.disabled = false;
      }

      if (textarea) {
        textarea.value = "";
        delete textarea.dataset.category;
      }

      await loadPosts();
    }
  }

  /* =========================
     LIKE A POST
  ========================= */

  async function handleLike(id) {
    if (!id || id.startsWith("local-")) {
      showToast(
        "This post needs a backend ID before it can be liked."
      );

      return;
    }

    try {
      await apiRequest(
        `/posts/${encodeURIComponent(id)}/like`,
        {
          method: "POST",
          body: JSON.stringify({
            author_name: currentUser?.name
          })
        }
      );

      await loadPosts();

    } catch (error) {
      showToast(
        "Could not like this post. Check that the backend is running."
      );
    }
  }

  /* =========================
     COMMENT ON A POST
  ========================= */

  async function handleComment(id) {
    if (!id || id.startsWith("local-")) {
      showToast(
        "Comments require a post saved on the backend."
      );

      return;
    }

    const content = window.prompt(
      "Write your comment:"
    );

    if (!content?.trim()) {
      return;
    }

    try {
      await apiRequest(
        `/posts/${encodeURIComponent(id)}/comments`,
        {
          method: "POST",

          body: JSON.stringify({
            content: content.trim(),
            author_name:
              currentUser?.name ||
              "Community member"
          })
        }
      );

      showToast("Comment added.");

      await loadPosts();

    } catch (error) {
      showToast(
        "Comments need a working backend connection."
      );
    }
  }

  /* =========================
     DELETE A POST
  ========================= */

  async function handleDelete(id) {
    if (!window.confirm("Delete this post?")) {
      return;
    }

    if (id.startsWith("local-")) {
      localPosts = localPosts.filter(
        post => postId(post) !== id
      );

      saveJSON(keys.posts, localPosts);

      showToast("Post deleted.");

      await loadPosts();

      return;
    }

    try {
      await apiRequest(
        `/posts/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );

      localPosts = localPosts.filter(
        post => postId(post) !== id
      );

      saveJSON(keys.posts, localPosts);

      showToast("Post deleted.");

      await loadPosts();

    } catch (error) {
      showToast(
        "Could not delete this post. Check the backend."
      );
    }
  }

  /* =========================
     PROFILE POSTS AND STATS
  ========================= */

  function renderProfilePosts() {
    const container = $("#profileFeed");

    if (!container) {
      return;
    }

    const mine = allPosts.filter(isMine);

    renderFeed(container, mine, "profile");
  }

  function updateProfileStats() {
    const mine = allPosts.filter(isMine);

    const postCount = $("#profilePostCount");
    const likeCount = $("#profileLikeCount");
    const savedCount = $("#profileSavedCount");

    if (postCount) {
      postCount.textContent = mine.length;
    }

    if (likeCount) {
      likeCount.textContent = mine.reduce(
        (sum, post) => sum + postLikes(post),
        0
      );
    }

    if (savedCount) {
      savedCount.textContent = savedPosts.length;
    }
  }

  /* =========================
     GLOBAL CLICK HANDLERS
  ========================= */

  document.addEventListener(
    "click",
    async event => {

      const nav = event.target.closest("[data-page]");

      if (nav) {
        navigate(nav.dataset.page);
        return;
      }

      const like = event.target.closest(
        "[data-like-post]"
      );

      if (like) {
        await handleLike(like.dataset.likePost);
        return;
      }

      const comment = event.target.closest(
        "[data-comment-post]"
      );

      if (comment) {
        await handleComment(
          comment.dataset.commentPost
        );

        return;
      }

      const save = event.target.closest(
        "[data-save-post]"
      );

      if (save) {
        const id = save.dataset.savePost;

        savedPosts = savedPosts
          .map(String)
          .includes(id)
          ? savedPosts.filter(
              item => String(item) !== id
            )
          : [...savedPosts, id];

        saveJSON(keys.saved, savedPosts);

        renderAllFeeds();

        showToast(
          savedPosts.map(String).includes(id)
            ? "Post saved."
            : "Post removed from saved posts."
        );

        return;
      }

      const del = event.target.closest(
        "[data-delete-post]"
      );

      if (del) {
        await handleDelete(
          del.dataset.deletePost
        );
      }
    }
  );

  /* =========================
     SIGN IN
  ========================= */

  $("#signInForm")?.addEventListener(
    "submit",
    event => {
      event.preventDefault();

      const name = $("#displayName")?.value.trim();

      if (name) {
        setUser(name);
      }

      navigate("home");

      loadPosts();
    }
  );

  /* =========================
     POST FORM
  ========================= */

  $("#postForm")?.addEventListener(
    "submit",
    publishPost
  );

  /* =========================
     COMMUNITY FEED CONTROLS
  ========================= */

  $("#refreshCommunityPosts")?.addEventListener(
    "click",
    loadPosts
  );

  $("#feedSort")?.addEventListener(
    "change",
    renderAllFeeds
  );

  $("#communityFeedSort")?.addEventListener(
    "change",
    renderAllFeeds
  );

  $("#globalSearch")?.addEventListener(
    "input",
    renderAllFeeds
  );

  $("#discoverSearch")?.addEventListener(
    "input",
    renderAllFeeds
  );

  /* =========================
     COMPOSER BUTTONS
  ========================= */

  $("#scrollToComposer")?.addEventListener(
    "click",
    () => {
      $("#postComposer")?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      $("#postText")?.focus();
    }
  );

  $("#openComposer")?.addEventListener(
    "click",
    () => $("#postText")?.focus()
  );

  $("#storyCreatePost")?.addEventListener(
    "click",
    () => $("#postText")?.focus()
  );

  $("#mobileCreatePost")?.addEventListener(
    "click",
    () => {
      navigate("home");

      setTimeout(() => {
        $("#postComposer")?.scrollIntoView({
          behavior: "smooth"
        });

        $("#postText")?.focus();
      }, 50);
    }
  );

  /* =========================
     POST CATEGORIES
  ========================= */

  $("#addProjectTag")?.addEventListener(
    "click",
    () => {
      const field = $("#postText");

      if (field) {
        field.dataset.category = "Projects";

        field.value += field.value
          ? "\n\n#Project "
          : "#Project ";

        field.focus();
      }
    }
  );

  $("#addLearningTag")?.addEventListener(
    "click",
    () => {
      const field = $("#postText");

      if (field) {
        field.dataset.category = "Learning";

        field.value += field.value
          ? "\n\n#Learning "
          : "#Learning ";

        field.focus();
      }
    }
  );

  $$(".category-card").forEach(button => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;

      const search = $("#discoverSearch");

      if (search) {
        search.value = category;
      }

      navigate("discover");

      renderAllFeeds();
    });
  });

  /* =========================
     MODALS
  ========================= */

  $$("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => {
      const modal = $(
        `#${button.dataset.closeModal}`
      );

      modal?.classList.add("hidden");
    });
  });

  $("#editProfileButton")?.addEventListener(
    "click",
    () => {
      const nameInput = $("#editName");
      const bioInput = $("#editBio");

      if (nameInput) {
        nameInput.value = currentUser?.name || "";
      }

      if (bioInput) {
        bioInput.value =
          $("#profileBio")?.textContent || "";
      }

      $("#profileModal")?.classList.remove("hidden");
    }
  );

  /* =========================
     EDIT PROFILE
  ========================= */

  $("#profileForm")?.addEventListener(
    "submit",
    event => {
      event.preventDefault();

      const name = $("#editName")?.value.trim();

      if (!name) {
        return;
      }

      setUser(name);

      const bio =
        $("#editBio")?.value.trim() ||
        "Building, learning and sharing one step at a time.";

      const profileBio = $("#profileBio");

      if (profileBio) {
        profileBio.textContent = bio;
      }

      $("#profileModal")?.classList.add("hidden");

      showToast("Profile updated on this device.");

      renderAllFeeds();
    }
  );

  /* =========================
     NOTIFICATIONS
  ========================= */

  $("#notificationButton")?.addEventListener(
    "click",
    () => {
      $("#notificationModal")?.classList.remove("hidden");
    }
  );

  /* =========================
     SAVED POSTS
  ========================= */

  $("#savedPostsButton")?.addEventListener(
    "click",
    () => {
      const ids = savedPosts.map(String);

      const saved = allPosts.filter(post =>
        ids.includes(postId(post))
      );

      navigate("community");

      const feed = $("#communityFeed");

      if (feed) {
        renderFeed(feed, saved, "community");
      }

      const status = $("#communityPostsStatus");

      if (status) {
        status.textContent =
          `${saved.length} saved post` +
          `${saved.length === 1 ? "" : "s"}`;
      }
    }
  );

  $("#myPostsButton")?.addEventListener(
    "click",
    () => navigate("profile")
  );

  /* =========================
     LEARNING SECTION
  ========================= */

  $("#learningStartButton")?.addEventListener(
    "click",
    () => {
      $("#learningResources")?.scrollIntoView({
        behavior: "smooth"
      });
    }
  );

  /* =========================
     JOB SEARCH
  ========================= */

  $("#jobSearch")?.addEventListener(
    "input",
    () => {
      const query = $("#jobSearch").value.trim();

      const status = $("#jobsStatus");

      if (status) {
        status.textContent = query
          ? `Job search: "${query}". Connect a jobs API to show live listings.`
          : "Connect to the backend to load current public listings.";
      }
    }
  );

  $("#searchJobsButton")?.addEventListener(
    "click",
    () => {
      showToast(
        "Live job listings require a jobs API connection."
      );
    }
  );

  /* =========================
     MOBILE MENU
  ========================= */

  $("#menuToggle")?.addEventListener(
    "click",
    () => {
      $(".top-actions")?.classList.toggle(
        "mobile-menu-open"
      );
    }
  );

  /* =========================
     FOOTER LINKS
  ========================= */

  ["aboutLink", "privacyLink", "helpLink"].forEach(
    id => {
      $(`#${id}`)?.addEventListener(
        "click",
        event => {
          event.preventDefault();

          showToast(
            "This information page has not been configured yet."
          );
        }
      );
    }
  );

  /* =========================
     INITIALIZE APPLICATION
  ========================= */

  const existingUser = readJSON(keys.user, null);

  if (existingUser?.name) {
    setUser(existingUser.name);
  }

  loadPosts();

})();