const express = require("express");
const path = require("path");
const crypto = require("crypto");
const db = require("./database");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Simple session store: token -> user id
const sessions = {};

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function getUserFromToken(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const userId = sessions[token];
  if (!userId) return null;
  return db.prepare("SELECT id, username, bio FROM users WHERE id = ?").get(userId);
}

function requireAuth(req, res, next) {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Login required" });
  req.user = user;
  next();
}

// ---------- Auth ----------

app.post("/api/register", (req, res) => {
  const { username, password, bio = "" } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const result = db.prepare(
      "INSERT INTO users (username, password, bio) VALUES (?, ?, ?)"
    ).run(username, hashPassword(password), bio);

    res.json({ message: "Account created", userId: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: "Username already exists" });
  }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare(
    "SELECT * FROM users WHERE username = ? AND password = ?"
  ).get(username, hashPassword(password));

  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const token = crypto.randomBytes(24).toString("hex");
  sessions[token] = user.id;

  res.json({
    token,
    user: { id: user.id, username: user.username, bio: user.bio }
  });
});

app.post("/api/logout", requireAuth, (req, res) => {
  const token = req.headers.authorization.replace("Bearer ", "");
  delete sessions[token];
  res.json({ message: "Logged out" });
});

// ---------- Profiles ----------

app.get("/api/users/:id", (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.username, u.bio,
      (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS post_count,
      (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) AS follower_count,
      (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following_count
    FROM users u WHERE u.id = ?
  `).get(req.params.id);

  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.put("/api/profile", requireAuth, (req, res) => {
  const { bio } = req.body;
  db.prepare("UPDATE users SET bio = ? WHERE id = ?").run(bio || "", req.user.id);
  res.json({ message: "Profile updated" });
});

// ---------- Posts ----------

app.get("/api/posts", (req, res) => {
  const currentUserId = getUserFromToken(req)?.id || 0;

  const posts = db.prepare(`
    SELECT p.id, p.content, p.created_at,
      u.id AS user_id, u.username,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
      EXISTS(
        SELECT 1 FROM likes l
        WHERE l.post_id = p.id AND l.user_id = ?
      ) AS liked_by_me
    FROM posts p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
  `).all(currentUserId);

  res.json(posts);
});

app.post("/api/posts", requireAuth, (req, res) => {
  const { content } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: "Post content is required" });
  }

  const result = db.prepare(
    "INSERT INTO posts (user_id, content) VALUES (?, ?)"
  ).run(req.user.id, content.trim());

  res.json({ message: "Post created", postId: result.lastInsertRowid });
});

app.delete("/api/posts/:id", requireAuth, (req, res) => {
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);

  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: "You can delete only your posts" });
  }

  db.prepare("DELETE FROM posts WHERE id = ?").run(req.params.id);
  res.json({ message: "Post deleted" });
});

// ---------- Comments ----------

app.get("/api/posts/:id/comments", (req, res) => {
  const comments = db.prepare(`
    SELECT c.id, c.content, c.created_at, u.id AS user_id, u.username
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);

  res.json(comments);
});

app.post("/api/posts/:id/comments", requireAuth, (req, res) => {
  const { content } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: "Comment cannot be empty" });
  }

  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const result = db.prepare(
    "INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)"
  ).run(req.params.id, req.user.id, content.trim());

  res.json({ message: "Comment added", commentId: result.lastInsertRowid });
});

// ---------- Likes ----------

app.post("/api/posts/:id/like", requireAuth, (req, res) => {
  const postId = req.params.id;

  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const existing = db.prepare(
    "SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?"
  ).get(req.user.id, postId);

  if (existing) {
    db.prepare("DELETE FROM likes WHERE user_id = ? AND post_id = ?")
      .run(req.user.id, postId);
    return res.json({ liked: false });
  }

  db.prepare("INSERT INTO likes (user_id, post_id) VALUES (?, ?)")
    .run(req.user.id, postId);

  res.json({ liked: true });
});

// ---------- Follows ----------

app.post("/api/users/:id/follow", requireAuth, (req, res) => {
  const targetId = Number(req.params.id);

  if (targetId === req.user.id) {
    return res.status(400).json({ error: "You cannot follow yourself" });
  }

  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
  if (!target) return res.status(404).json({ error: "User not found" });

  const existing = db.prepare(
    "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?"
  ).get(req.user.id, targetId);

  if (existing) {
    db.prepare(
      "DELETE FROM follows WHERE follower_id = ? AND following_id = ?"
    ).run(req.user.id, targetId);

    return res.json({ following: false });
  }

  db.prepare(
    "INSERT INTO follows (follower_id, following_id) VALUES (?, ?)"
  ).run(req.user.id, targetId);

  res.json({ following: true });
});

// ---------- Start ----------

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`Mini social app running: http://localhost:${PORT}`);
});