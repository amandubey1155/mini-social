const API = "";
let token = localStorage.getItem("token");
let currentUser = JSON.parse(localStorage.getItem("user") || "null");

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function show(id) {
  document.getElementById(id).classList.remove("hidden");
}

function hide(id) {
  document.getElementById(id).classList.add("hidden");
}

function updateAuthUI() {
  const authArea = document.getElementById("auth-area");

  if (currentUser) {
    authArea.innerHTML = `
      <span>@${currentUser.username}</span>
      <button onclick="logout()">Logout</button>
    `;
    hide("auth-section");
    show("feed-section");
    loadPosts();
  } else {
    authArea.innerHTML = "";
    show("auth-section");
    hide("feed-section");
    hide("profile-section");
  }
}

async function register() {
  try {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const bio = document.getElementById("bio").value.trim();

    await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ username, password, bio })
    });

    document.getElementById("auth-message").textContent =
      "Account created. Please log in.";
  } catch (error) {
    document.getElementById("auth-message").textContent = error.message;
  }
}

async function login() {
  try {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    token = data.token;
    currentUser = data.user;

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(currentUser));

    updateAuthUI();
  } catch (error) {
    document.getElementById("auth-message").textContent = error.message;
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  token = null;
  currentUser = null;
  updateAuthUI();
}

async function createPost() {
  const content = document.getElementById("post-content").value.trim();

  if (!content) return alert("Write something first.");

  await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({ content })
  });

  document.getElementById("post-content").value = "";
  loadPosts();
}

async function loadPosts() {
  const posts = await api("/api/posts");
  const container = document.getElementById("posts");
  container.innerHTML = "";

  posts.forEach(post => {
    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `
      <div class="post-header">
        <span class="username" onclick="openProfile(${post.user_id})">
          @${post.username}
        </span>
        <span class="muted">${new Date(post.created_at).toLocaleString()}</span>
      </div>

      <p>${escapeHTML(post.content)}</p>

      <div class="post-actions">
        <button onclick="toggleLike(${post.id})">
          ${post.liked_by_me ? "Unlike" : "Like"} (${post.like_count})
        </button>

        <button onclick="loadComments(${post.id})">
          Comments (${post.comment_count})
        </button>

        ${
          currentUser && currentUser.id === post.user_id
            ? `<button onclick="deletePost(${post.id})">Delete</button>`
            : ""
        }
      </div>

      <div id="comments-${post.id}"></div>
    `;

    container.appendChild(div);
  });
}

async function toggleLike(postId) {
  await api(`/api/posts/${postId}/like`, { method: "POST" });
  loadPosts();
}

async function deletePost(postId) {
  if (!confirm("Delete this post?")) return;

  await api(`/api/posts/${postId}`, { method: "DELETE" });
  loadPosts();
}

async function loadComments(postId) {
  const container = document.getElementById(`comments-${postId}`);

  if (container.dataset.open === "true") {
    container.innerHTML = "";
    container.dataset.open = "false";
    return;
  }

  const comments = await api(`/api/posts/${postId}/comments`);

  container.innerHTML = `
    <div class="comments">
      ${comments.map(comment => `
        <div class="comment">
          <strong>@${comment.username}</strong>
          <p>${escapeHTML(comment.content)}</p>
        </div>
      `).join("")}

      ${
        currentUser
          ? `
            <input id="comment-input-${postId}" placeholder="Add a comment" />
            <button onclick="addComment(${postId})">Comment</button>
          `
          : `<p class="muted">Log in to comment.</p>`
      }
    </div>
  `;

  container.dataset.open = "true";
}

async function addComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const content = input.value.trim();

  if (!content) return;

  await api(`/api/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content })
  });

  loadComments(postId);
  loadPosts();
}

async function openProfile(userId) {
  const user = await api(`/api/users/${userId}`);
  const posts = (await api("/api/posts")).filter(post => post.user_id === userId);

  hide("feed-section");
  show("profile-section");

  const isMe = currentUser && currentUser.id === user.id;

  document.getElementById("profile-card").innerHTML = `
    <h2>@${user.username}</h2>
    <p>${escapeHTML(user.bio || "No bio yet.")}</p>
    <p class="muted">
      ${user.post_count} posts •
      ${user.follower_count} followers •
      ${user.following_count} following
    </p>

    ${
      currentUser && !isMe
        ? `<button onclick="toggleFollow(${user.id})" id="follow-btn">Follow / Unfollow</button>`
        : ""
    }

    ${
      isMe
        ? `
          <textarea id="bio-input" placeholder="Update bio">${user.bio || ""}</textarea>
          <button onclick="updateBio()">Save Bio</button>
        `
        : ""
    }
  `;

  const postContainer = document.getElementById("profile-posts");
  postContainer.innerHTML = posts.length
    ? posts.map(post => `
        <div class="post">
          <p>${escapeHTML(post.content)}</p>
          <p class="muted">
            ${post.like_count} likes • ${post.comment_count} comments
          </p>
        </div>
      `).join("")
    : "<p class='muted'>No posts yet.</p>";
}

async function toggleFollow(userId) {
  await api(`/api/users/${userId}/follow`, { method: "POST" });
  openProfile(userId);
}

async function updateBio() {
  const bio = document.getElementById("bio-input").value;

  await api("/api/profile", {
    method: "PUT",
    body: JSON.stringify({ bio })
  });

  currentUser.bio = bio;
  localStorage.setItem("user", JSON.stringify(currentUser));
  openProfile(currentUser.id);
}

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

updateAuthUI();