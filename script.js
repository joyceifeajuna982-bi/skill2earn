"use strict";

/* =========================================================
   SKILL2EARN — FRONTEND APPLICATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "http://127.0.0.1:5501/api";

    const state = {
        user: null,
        posts: [],
        jobs: [],
        savedPosts: JSON.parse(
            localStorage.getItem("s2e_saved_posts") || "[]"
        ),
        selectedFile: null,
        currentCategory: "",
        showOnlyMine: false,
        pageSize: 20,
        loadingPosts: false
    };

    const $ = (selector, parent = document) => parent.querySelector(selector);     const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            };
            return entities[character];
        });
    }

    function getInitials(name) {
        const cleaned = String(name || "S").trim();
        if (!cleaned) return "S";
        return cleaned
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("");
    }

    function formatNumber(value) {
        return new Intl.NumberFormat().format(Number(value) || 0);
    }

    function formatDate(value) {
        if (!value) return "Recently";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "Recently";
        }
        const elapsed = Date.now() - date.getTime();
        if (elapsed < 0) {
            return date.toLocaleDateString();
        }
        const minutes = Math.floor(elapsed / 60000);
        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    function showToast(message, type = "success") {
        const container = $("#toastContainer");
        if (!container) {
            alert(message);
            return;
        }
        const toast = document.createElement("div");
        toast.className = `toast ${type === "error" ? "error" : ""}`;
        const icon = document.createElement("i");
        icon.className = type === "error"
            ? "fa-solid fa-circle-exclamation"
            : "fa-solid fa-circle-check";
        const text = document.createElement("span");
        text.textContent = message;
        toast.append(icon, text);
        container.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3500);
    }

    function setButtonLoading(button, loading, text = "Please wait...") {
        if (!button) return;
        if (loading) {
            button.dataset.originalText = button.innerHTML;
            button.disabled = true;
            button.textContent = text;
        } else {
            button.disabled = false;
            if (button.dataset.originalText) {
                button.innerHTML = button.dataset.originalText;
                delete button.dataset.originalText;
            }
        }
    }

    function getPostId(post) {
        return post.id ?? post.post_id ?? post._id;
    }

    function getPostAuthor(post) {
        return post.author_name ?? post.username ?? post.author ?? "Community member";
    }

    function getPostText(post) {
        return post.content ?? post.text ?? post.caption ?? "";
    }

    function getPostImage(post) {
        return post.media_url ?? post.image_url ?? post.image ?? "";
    }

    function getPostLikes(post) {
        return Number(post.likes_count ?? post.likes ?? 0);
    }

    function getPostComments(post) {
        const comments = post.comments;
        if (Array.isArray(comments)) {
            return comments;
        }
        return [];
    }

    function getCurrentUserId() {
        return state.user?.id ?? state.user?.user_id ?? null;
    }

    function isOwnPost(post) {
        const authorId = post.user_id ?? post.author_id;
        const currentId = getCurrentUserId();
        if (authorId != null && currentId != null) {
            return String(authorId) === String(currentId);
        }
        return getPostAuthor(post) === state.user?.name;
    }

    function isPostLiked(post) {
        if (post.liked_by_me === true || post.is_liked === true) {
            return true;
        }
        return false;
    }

    async function apiRequest(path, options = {}) {
        const response = await fetch(`${API_BASE}${path}`, options);
        if (!response.ok) {
            let message = `Request failed (${response.status})`;
            try {
                const body = await response.json();
                message = body.detail || body.message || message;
            } catch {
                // fallback
            }
            throw new Error(message);
        }
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            return response.json();
        }
        return response.text();
    }

    function normalizePosts(result) {
        if (Array.isArray(result)) return result;
        if (Array.isArray(result?.posts)) return result.posts;
        if (Array.isArray(result?.items)) return result.items;
        return [];
    }

    // Sign-In Handling
    const welcomeScreen = $("#welcomeScreen");
    const appLayout = $("#appLayout");
    const signInForm = $("#signInForm");
    const displayNameInput = $("#displayName");
    const sidebarName = $("#sidebarName");
    const sidebarAvatar = $("#sidebarAvatar");
    const topAvatar = $("#topAvatar");
    const composerAvatar = $("#composerAvatar");

    function enterApplication(name) {
        const cleanName = String(name || "").trim().slice(0, 40);
        if (!cleanName) {
            showToast("Please enter your name first.", "error");
            return;
        }
        state.user = { name: cleanName };
        localStorage.setItem("s2e_demo_user", JSON.stringify(state.user));
        updateUserInterface();
        if (welcomeScreen) welcomeScreen.classList.add("hidden");
        if (appLayout) appLayout.classList.remove("hidden");
        loadPosts();
        loadJobs();
        showToast(`Welcome to Skill2Earn, ${cleanName}!`);
    }

    function updateUserInterface() {
        if (!state.user) return;
        const name = state.user.name;
        const initials = getInitials(name);
        if (sidebarName) sidebarName.textContent = name;
        if (sidebarAvatar) sidebarAvatar.textContent = initials;
        if (topAvatar) topAvatar.textContent = initials;
        if (composerAvatar) composerAvatar.textContent = initials;
        const profileAvatar = $("#profileAvatar");
        const profileName = $("#profileName");
        if (profileAvatar) profileAvatar.textContent = initials;
        if (profileName) profileName.textContent = name;
        
        const editName = $("#editName");
        if (editName) editName.value = name;
        const editBio = $("#editBio");
        if (editBio) {
            editBio.value = state.user.bio || "Building, learning and sharing one step at a time.";
        }
        updateProfileStats();
    }

    signInForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        enterApplication(displayNameInput?.value);
    });

    function restoreSession() {
        try {
            const saved = localStorage.getItem("s2e_demo_user");
            if (!saved) return;
            const user = JSON.parse(saved);
            if (user && typeof user.name === "string" && user.name.trim()) {
                state.user = user;
                updateUserInterface();
                if (welcomeScreen) welcomeScreen.classList.add("hidden");
                if (appLayout) appLayout.classList.remove("hidden");
                loadPosts();
                loadJobs();
            }
        } catch (error) {
            console.error("Could not restore session:", error);
            localStorage.removeItem("s2e_demo_user");
        }
    }

    // Navigation
    function navigateTo(pageName) {
        const target = $(`#page-${pageName}`);
        if (!target) return;
        $$(".page-section").forEach((section) => {             section.classList.toggle("active", section === target);         });         $$
(".nav-link[data-page]").forEach((link) => {
            link.classList.toggle("active", link.dataset.page === pageName);
        });
        if (pageName === "discover") renderDiscoverFeed();
        if (pageName === "profile") {
            renderProfileFeed();
            updateProfileStats();
        }
        if (pageName === "jobs" && state.jobs.length === 0) loadJobs();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    document.addEventListener("click", (event) => {
        const pageButton = event.target.closest("[data-page]");
        if (pageButton && pageButton.dataset.page) {
            navigateTo(pageButton.dataset.page);
        }
    });

    // Media Upload & Previews
    const mediaInput = $("#mediaInput");
    const uploadPreview = $("#uploadPreview");
    const imagePreview = $("#imagePreview");
    const videoPreview = $("#videoPreview");
    const removeUpload = $("#removeUpload");

    mediaInput?.addEventListener("change", () => {
        const file = mediaInput.files?.[0];
        clearSelectedMedia(false);
        if (!file) return;
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        if (!isImage && !isVideo) {
            showToast("Choose an image or video file.", "error");
            mediaInput.value = "";
            return;
        }
        if (file.size > 25 * 1024 * 1024) {
            showToast("File must be smaller than 25 MB.", "error");
            mediaInput.value = "";
            return;
        }
        state.selectedFile = file;
        const localUrl = URL.createObjectURL(file);
        uploadPreview?.classList.remove("hidden");
        if (isImage) {
            if (imagePreview) {
                imagePreview.src = localUrl;
                imagePreview.classList.remove("hidden");
            }
            if (videoPreview) {
                videoPreview.classList.add("hidden");
                videoPreview.removeAttribute("src");
            }
        } else {
            if (videoPreview) {
                videoPreview.src = localUrl;
                videoPreview.classList.remove("hidden");
            }
            if (imagePreview) {
                imagePreview.classList.add("hidden");
                imagePreview.removeAttribute("src");
            }
        }
    });

    function clearSelectedMedia(clearInput = true) {
        const imageUrl = imagePreview?.src || "";
        const videoUrl = videoPreview?.src || "";
        if (imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
        if (videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);

        if (imagePreview) {
            imagePreview.removeAttribute("src");
            imagePreview.classList.add("hidden");
        }
        if (videoPreview) {
            videoPreview.pause();
            videoPreview.removeAttribute("src");
            videoPreview.load();
            videoPreview.classList.add("hidden");
        }
        uploadPreview?.classList.add("hidden");
        if (clearInput && mediaInput) mediaInput.value = "";
        state.selectedFile = null;
    }

    removeUpload?.addEventListener("click", () => clearSelectedMedia());

    // Composer Form Submission
    const postForm = $("#postForm");
    const postText = $("#postText");
    const postMessage = $("#postMessage");

    postForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!state.user) {
            showToast("Please sign in first.", "error");
            return;
        }
        const content = postText.value.trim();
        const file = state.selectedFile;
        if (!content && !file) {
            showToast("Write something or attach media.", "error");
            return;
        }

        const publishButton = $('button[type="submit"]', postForm);
        setButtonLoading(publishButton, true, "Publishing...");
        if (postMessage) postMessage.textContent = "";

        try {
            let createdPost;
            if (file) {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("content", content);
                formData.append("author_name", state.user.name);
                formData.append("category", detectCategory(content));
                createdPost = await apiRequest("/upload", {
                    method: "POST",
                    body: formData
                });
            } else {
                createdPost = await apiRequest("/posts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        content,
                        author_name: state.user.name,
                        category: detectCategory(content)
                    })
                });
            }

            if (createdPost && typeof createdPost === "object") {
                const normalized = createdPost.post || createdPost;
                state.posts.unshift(normalized);
            }

            postText.value = "";
            clearSelectedMedia();
            if (postMessage) postMessage.textContent = "Your post has been published.";
            
            state.showOnlyMine = false;
            state.currentCategory = "";
            renderFeed();
            renderDiscoverFeed();
            renderProfileFeed();
            updateProfileStats();
            showToast("Your post is now live!");
        } catch (error) {
            console.error("Publishing failed:", error);
            showToast(error.message || "Could not publish your post.", "error");
        } finally {
            setButtonLoading(publishButton, false);
        }
    });

    function detectCategory(text) {
        const lower = String(text).toLowerCase();
        if (lower.includes("#coding") || lower.includes("#project")) return "Coding";
        if (lower.includes("#design")) return "Design";
        if (lower.includes("#business")) return "Business";
        if (lower.includes("#learning") || lower.includes("#education")) return "Learning";
        if (lower.includes("#photography")) return "Photography";
        return "Community";
    }

    // Load Posts
    const feedList = $("#feedList");
    async function loadPosts() {
        if (state.loadingPosts) return;
        state.loadingPosts = true;
        try {
            const result = await apiRequest(`/posts?skip=0&limit=${state.pageSize}`);
            state.posts = normalizePosts(result);
            renderFeed();
            renderDiscoverFeed();
            renderProfileFeed();
            updateProfileStats();
        } catch (error) {
            console.error("Loading posts failed:", error);
            if (feedList) {
                feedList.innerHTML = `
                    <div class="empty-state">
                        <h3>Can't connect to the backend</h3>
                        <p>Make sure the FastAPI server is running at <strong>127.0.0.1:5501</strong>.</p>
                        <button class="secondary-button" id="retryPostsButton">Try again</button>
                    </div>
                `;
            }
        } finally {
            state.loadingPosts = false;
        }
    }

    document.addEventListener("click", (e) => {
        if (e.target.closest("#retryPostsButton")) loadPosts();
    });

    // Rendering Post Cards
    function resolveMediaUrl(url) {
        if (!url) return "";
        const value = String(url).trim();
        if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("blob:")) {
            return value;
        }
        return `http://127.0.0.1:5501${value.startsWith("/") ? "" : "/"}${value}`;
    }

    function isVideoUrl(url, post) {
        const type = String(post.media_type ?? "").toLowerCase();
        if (type.includes("video")) return true;
        return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url);
    }

    function renderMedia(post) {
        const media = getPostImage(post);
        if (!media) return "";
        const url = resolveMediaUrl(media);
        const safeUrl = escapeHTML(url);
        if (isVideoUrl(url, post)) {
            return `
                <div class="post-media">
                    <video controls preload="metadata" src="${safeUrl}">
                        Your browser does not support video playback.
                    </video>
                </div>
            `;
        }
        return `
            <div class="post-media">
                <img src="${safeUrl}" alt="Media shared by ${escapeHTML(getPostAuthor(post))}" loading="lazy" onerror="this.closest('.post-media').style.display='none'">
            </div>
        `;
    }

    function renderPost(post) {
        const postId = getPostId(post);
        if (postId == null) return "";
        const author = getPostAuthor(post);
        const content = getPostText(post);
        const likes = getPostLikes(post);
        const comments = getPostComments(post);
        const liked = isPostLiked(post);
        const saved = state.savedPosts.some((id) => String(id) === String(postId));
        const category = post.category || "Community";
        const date = formatDate(post.created_at ?? post.timestamp ?? post.date);

        const commentsMarkup = comments.map((c) => {
            const commentAuthor = c.author_name ?? c.username ?? "Community member";
            const commentContent = c.content ?? c.text ?? "";
            return `
                <div class="comment-item">
                    <div class="comment-avatar">${escapeHTML(getInitials(commentAuthor))}</div>
                    <div class="comment-bubble">
                        <strong>${escapeHTML(commentAuthor)}</strong>
                        <p>${escapeHTML(commentContent)}</p>
                    </div>
                </div>
            `;
        }).join("");

        return `
            <article class="post-card" data-post-id="${escapeHTML(postId)}">
                <header class="post-header">
                    <div class="post-avatar">${escapeHTML(getInitials(author))}</div>
                    <div class="post-user-info">
                        <h3>${escapeHTML(author)}</h3>
                        <p>${escapeHTML(date)} · <i class="fa-solid fa-earth-africa"></i> Public</p>
                    </div>
                </header>
                <span class="post-category">${escapeHTML(category)}</span>
                ${content ? `<div class="post-content">${escapeHTML(content)}</div>` : ""}
                ${renderMedia(post)}
                <div class="post-stats">
                    <div class="post-stats-left">
                        <span class="like-dot"><i class="fa-solid fa-thumbs-up"></i></span>
                        <span data-role="like-count">${formatNumber(likes)}</span>
                    </div>
                    <span><span data-role="comment-count">${formatNumber(comments.length)}</span> comments</span>
                </div>
                <div class="post-actions">
                    <button class="post-action ${liked ? "liked" : ""}" data-action="like">
                        <i class="${liked ? "fa-solid" : "fa-regular"} fa-thumbs-up"></i>
                        <span>${liked ? "Liked" : "Like"}</span>
                    </button>
                    <button class="post-action" data-action="comment">
                        <i class="fa-regular fa-comment"></i>
                        <span>Comment</span>
                    </button>
                    <button class="post-action ${saved ? "saved" : ""}" data-action="save">
                        <i class="${saved ? "fa-solid" : "fa-regular"} fa-bookmark"></i>
                        <span>${saved ? "Saved" : "Save"}</span>
                    </button>
                </div>
                <div class="post-comments hidden">
                    <div class="comments-list">${commentsMarkup}</div>
                    <form class="comment-form">
                        <input type="text" name="comment" placeholder="Write a comment..." maxlength="1000" required>
                        <button type="submit" aria-label="Send comment"><i class="fa-solid fa-paper-plane"></i></button>
                    </form>
                </div>
            </article>
        `;
    }

    function renderEmptyFeed(container, title, description) {
        if (!container) return;
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fa-regular fa-images"></i></div>
                <h3>${escapeHTML(title)}</h3>
                <p>${escapeHTML(description)}</p>
            </div>
        `;
    }

    const globalSearch = $("#globalSearch");
    const discoverSearch = $("#discoverSearch");
    const feedSort = $("#feedSort");
    const discoverFeed = $("#discoverFeed");
    const profileFeed = $("#profileFeed");

    function getFilteredPosts() {
        let posts = [...state.posts];
        if (state.currentCategory) {
            const cat = state.currentCategory.toLowerCase();
            posts = posts.filter((p) => {
                const text = [getPostText(p), p.category, getPostAuthor(p)].join(" ").toLowerCase();
                return text.includes(cat);
            });
        }
        if (state.showOnlyMine) {
            posts = posts.filter(isOwnPost);
        }
        const term = String(globalSearch?.value || "").trim().toLowerCase();
        if (term) {
            posts = posts.filter((p) => {
                const text = [getPostText(p), getPostAuthor(p), p.category].join(" ").toLowerCase();
                return text.includes(term);
            });
        }
        if (feedSort?.value === "popular") {
            posts.sort((a, b) => getPostLikes(b) - getPostLikes(a));
        } else {
            posts.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        }
        return posts;
    }

    function renderFeed() {
        if (!feedList) return;
        const posts = getFilteredPosts();
        if (posts.length === 0) {
            renderEmptyFeed(
                feedList,
                state.currentCategory ? `No posts about ${state.currentCategory} yet` : "No posts to show yet",
                "Be the first to share a project, idea, or useful tip."
            );
            return;
        }
        feedList.innerHTML = posts.map(renderPost).join("");
    }

    function renderDiscoverFeed() {
        if (!discoverFeed) return;
        let posts = [...state.posts];
        const term = String(discoverSearch?.value || "").trim().toLowerCase();
        if (term) {
            posts = posts.filter((p) => [getPostText(p), getPostAuthor(p), p.category].join(" ").toLowerCase().includes(term));
        }
        if (posts.length === 0) {
            renderEmptyFeed(discoverFeed, "Nothing found yet", "Try another search.");
        } else {
            discoverFeed.innerHTML = posts.map(renderPost).join("");
        }
    }

    function renderProfileFeed() {
        if (!profileFeed) return;
        const posts = state.posts.filter(isOwnPost);
        if (posts.length === 0) {
            renderEmptyFeed(profileFeed, "Your story starts here", "Share your first project or idea.");
        } else {
            profileFeed.innerHTML = posts.map(renderPost).join("");
        }
    }

    // Likes & Actions Delegation
    async function toggleLike(postCard) {
        const postId = postCard.dataset.postId;
        if (!postId) return;
        try {
            await apiRequest(`/posts/${encodeURIComponent(postId)}/like`, { method: "POST" });
            await loadPosts();
        } catch (error) {
            showToast(error.message || "Could not like post.", "error");
        }
    }

    function toggleSavedPost(postId) {
        const idx = state.savedPosts.indexOf(postId);
        if (idx >= 0) {
            state.savedPosts.splice(idx, 1);
            showToast("Removed from saved posts.");
        } else {
            state.savedPosts.push(postId);
            showToast("Saved for later.");
        }
        localStorage.setItem("s2e_saved_posts", JSON.stringify(state.savedPosts));
        renderFeed();
    }

    document.addEventListener("click", async (event) => {
        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) return;
        const action = actionButton.dataset.action;
        const postCard = actionButton.closest(".post-card");
        if (!postCard) return;
        const postId = postCard.dataset.postId;

        if (action === "like") await toggleLike(postCard);
        if (action === "comment") {
            const comments = $(".post-comments", postCard);
            comments?.classList.toggle("hidden");
        }
        if (action === "save") toggleSavedPost(postId);
    });

    document.addEventListener("submit", async (event) => {
        const form = event.target.closest(".comment-form");
        if (!form) return;
        event.preventDefault();
        const postCard = form.closest(".post-card");
        const postId = postCard?.dataset.postId;
        const input = $('input[name="comment"]', form);
        const content = input?.value.trim();
        if (!postId || !content) return;

        try {
            await apiRequest(`/posts/${encodeURIComponent(postId)}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content,
                    author_name: state.user?.name || "Community member"
                })
            });
            input.value = "";
            await loadPosts();
            showToast("Comment added.");
        } catch (error) {
            showToast(error.message || "Could not add comment.", "error");
        }
    });

    // Profile Stats Update
    function updateProfileStats() {
        const myPosts = state.posts.filter(isOwnPost);
        const postCount = $("#profilePostCount");
        const likeCount = $("#profileLikeCount");
        const savedCount = $("#profileSavedCount");

        if (postCount) postCount.textContent = formatNumber(myPosts.length);
        if (likeCount) {
            const totalLikes = myPosts.reduce((sum, p) => sum + getPostLikes(p), 0);
            likeCount.textContent = formatNumber(totalLikes);
        }
        if (savedCount) savedCount.textContent = formatNumber(state.savedPosts.length);
    }

    // Load Jobs (Stub/Safe fetch)
    const jobsList = $("#jobsList");
    const jobsStatus = $("#jobsStatus");
    async function loadJobs() {
        if (!jobsList) return;
        try {
            const result = await apiRequest("/jobs");
            state.jobs = Array.isArray(result) ? result : [];
            if (jobsStatus) jobsStatus.textContent = `${state.jobs.length} public listing(s) loaded.`;
        } catch {                                      
            if (jobsStatus) jobsStatus.textContent = "Could not load job listings.";
        }
    }

    restoreSession();
});