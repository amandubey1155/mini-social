# Mini Social 🌐

A lightweight full-stack social media web application built with **Node.js**, **Express**, and **SQLite (better-sqlite3)**.

## ✨ Features

- 👤 **User Authentication**: User registration, secure login with SHA-256 password hashing, and token-based sessions.
- 📝 **Posts & Feed**: Create and delete posts, view global chronological post feed with live counters.
- 💬 **Comments**: Add and view comments under posts.
- ❤️ **Likes**: Like and unlike posts with real-time state tracking.
- 👥 **Follow System**: Follow and unfollow users to connect with others.
- 📄 **User Profiles**: View profiles, user post count, follower/following counts, and edit profile bios.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite with `better-sqlite3`
- **Frontend**: HTML5, CSS3, Vanilla JavaScript

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/amandubey1155/mini-social.git
   cd mini-social
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3100
   ```

> **Note**: The SQLite database (`social.db`) and all required tables are automatically initialized on the first run.
