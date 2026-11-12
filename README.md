<div align="center">

# 🏛️ SQL Arena

**An Interactive, Sandboxed SQL Interview Mastery Platform for Data Engineers**

**[🇺🇸 English](README.md) • [🇪🇸 Español](README.es.md)**

[![MySQL 8.0+](https://img.shields.io/badge/MySQL-8.0%2B-00758F?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Node.js Express](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://expressjs.com/)
[![Monaco Editor](https://img.shields.io/badge/Monaco_Editor-VS_Dark-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://microsoft.github.io/monaco-editor/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Test Suite](https://img.shields.io/badge/Tests-138%2F138_Passing-success?style=for-the-badge&logo=checkmarx&logoColor=white)](#-test-suite--quality-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

*Engineered to bridge the gap between basic syntax and production-grade query mastery for **LeetCode SQL 50**, **HackerRank SQL (Intermediate & Advanced)**, and **Data Engineering Technical Interviews**.*

[Features](#-key-features) • [Architecture](#-architecture) • [Curriculum](#-curriculum--technical-domains) • [Quickstart](#-quickstart) • [Verification](#-test-suite--quality-gate) • [Author](#-author)

</div>

---

## 📌 Overview

**SQL Arena** is a full-stack, sandboxed SQL drill and evaluation platform built specifically for data engineers and analytics practitioners. Unlike superficial online sandboxes, SQL Arena runs on a dedicated local **MySQL 8.0+ engine** with an enterprise-grade execution runner, real-time visual diff diagnostics, an automated curriculum verification harness, and deep Staff-Engineer level pedagogical guides.

It was designed to systematically eliminate the subtle, high-impact pitfalls encountered in technical interviews and production systems: **Three-Valued Logic (`UNKNOWN`), semi-joins vs anti-joins (`EXISTS` / `NOT EXISTS`), non-SARGable filters, multibyte UTF-8 string truncation, window frames (`ROWS` vs `RANGE`), recursive CTE termination, and deterministic deduplication.**

---

## 🏗️ Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Layer (Port 3000)"]
        UI["⚛️ React 19 SPA"]
        Editor["💻 Monaco SQL Editor\n(Hotkeys: Ctrl+Enter, Ctrl+Shift+Enter)"]
        Guides["📖 Staff-Engineer Markdown Guides\n(ASCII Mental Models & Query Planner Internals)"]
        DiffUI["🔍 Visual Diff Engine\n(Row, Column & Data Mismatch Highlights)"]
    end

    subgraph Server ["Backend API & Sandbox Engine (Port 5000)"]
        Express["🟢 Node.js / Express API"]
        Mutex["🔒 ExecutionMutex\n(In-Memory Sequential Sandbox Resets)"]
        Parser["🛡️ Lexical Statement Splitter\n(Anti-Injection, Single-Statement Gate)"]
        Runner["⚡ Query Runner & Evaluator\n(Positional Matching, 5s Timeouts, 0-Row Fields)"]
        Telem["📊 Telemetry & Progress Logger\n(Appends to sql_progress.txt & jsonl)"]
    end

    subgraph Harness ["Quality & Curriculum Harness (SSoT)"]
        CLI["🛠️ harness/cli.js\n(Static Topic Linter & Dynamic Sandbox Validator)"]
    end

    subgraph Database ["Database Layer (Port 3306)"]
        MySQL[("🐬 MySQL Server 8.0+\n(sql_arena_sandbox)")]
    end

    UI <-->|HTTP / JSON| Express
    Express --> Mutex
    Mutex --> Parser
    Parser --> Runner
    Runner <-->|mysql2 connection pool| MySQL
    Runner --> Telem
    CLI <-->|DDL/DML & Edge-Case Verification| MySQL
```

---

## ✨ Key Features

### 1. Hardened Sandbox Runner Engine
- **In-Memory Concurrency Serialization (`ExecutionMutex`):** Serializes sandbox DDL/DML resets (`DROP/CREATE/INSERT`) to eliminate OS-level file handle collisions on Windows NTFS (`innodb_file_per_table=1`).
- **Lexical Single-Statement Parser:** Tokenizes user queries to detect nested comments (`--`, `/* */`), string literals, and parentheses, strictly rejecting stacked multi-statement injection attempts (`DROP TABLE`, `GRANT`).
- **Zero-Row Metadata Extraction:** Inspects driver raw `fields` packets to preserve projected schema definitions even when a query yields 0 rows, preventing false-positive column mismatches.
- **Positional Column Verification:** Validates column projection order and aliases; swapped projections (e.g. `SELECT bonus, name` vs `SELECT name, bonus`) are flagged with `columnOrderMismatch`.
- **5-Second Hard Execution Timeout:** Intercepts runaway queries and infinite recursion loops via `SET SESSION max_execution_time = 5000` and `PROTOCOL_SEQUENCE_TIMEOUT`, returning clean `TIME_LIMIT_EXCEEDED` statuses.

### 2. Staff-Engineer Pedagogical Modules & SSoT Harness
Each technical module is governed by a canonical 6-section specification validated via `harness/cli.js`:
1. **Logical Query Processing & Formal Relational Algebra:** Clear pipelines detailing execution order and Codd's 3VL rules.
2. **High-Fidelity ASCII Visual Mental Models:** Unicode diagrams illustrating window sliding frames, 3VL truth tables, and short-circuit semi-joins.
3. **MySQL 8.0 InnoDB & Query Planner Internals:** Deep dives into B+ Tree index scans, Hash Joins, `join_buffer_size`, and SARGability.
4. **Staff Engineer Production Idioms:** Defensive SQL patterns (`NULLIF` + `COALESCE` safe division, `NOT EXISTS` anti-joins).
5. **Production Anti-Patterns & Root Cause Analysis:** Real-world failure modes with concrete refactoring recipes.
6. **FAANG & HackerRank Interview Heuristics:** Pattern-recognition rules for high-pressure technical assessments.

### 3. Real-Time Visual Diff & Telemetry Engine
- **Instant Result Comparison:** Evaluates student outputs against verified reference solutions across columns, row counts, and IEEE-754 normalized values.
- **Local Telemetry Logging:** Every submission is saved to `sql_progress.txt` and `logs/sql_submissions.jsonl`, tracking execution durations, query diffs, and unique problems solved.
- **Persistent Drafts:** Automatic `localStorage` caching ensures you never lose in-progress SQL code when switching between problems.

---

## 📚 Curriculum & Technical Domains

SQL Arena features **36 progressive exercises** across **12 core technical domains**:

| # | Technical Module | Core Concepts & Focus | Key Problems Included |
|---|------------------|-----------------------|-----------------------|
| 1 | **Null Handling & 3VL** | Three-valued logic (`UNKNOWN`), `IFNULL`, `COALESCE`, `NULLIF`, safe anti-joins. | *Employee Bonus*, *Null Reconciliation*, *NOT IN Null Trap* |
| 2 | **Rounding & Arithmetic** | `ROUND()`, `TRUNCATE()`, conditional aggregation, floating-point precision. | *Machine Processing Time*, *Confirmation Rate* |
| 3 | **Advanced Joins** | Conditional `ON ... AND ...` vs `WHERE`, triple joins, hierarchical self-joins. | *Visits Without Transactions*, *Customer Orders Catalog*, *Manager Reports* |
| 4 | **Date & Time Manipulation** | `DATEDIFF()`, `DATE_SUB()`, 30-day sliding windows, Day-1 cohort retention. | *Rising Temperature*, *30-Day Active Users*, *Day-1 Retention (LC 550)* |
| 5 | **Analytical Deduplication** | `ROW_NUMBER() = 1` vs `RANK() = 1`, deterministic tie-breakers, latest-per-key. | *Analytical Deduplication*, *Unique Subjects*, *Latest per Key* |
| 6 | **String Manipulation** | Logical `CHAR_LENGTH()` vs physical bytes `LENGTH()`, `CONCAT`, `SUBSTRING`, UTF-8. | *Fix Names*, *Invalid Tweets (Multibyte Safe)* |
| 7 | **CTEs & Chained Pipelines** | Modular `WITH a AS (...), b AS (...)` pipelines, readability, CTE scopes. | *Department Average Salary*, *Top Regional Branch* |
| 8 | **Correlated Subqueries** | Scalar and correlated subqueries, filtering aggregations, orphan detection. | *Managers with ≥5 Reports*, *Employees Whose Manager Left* |
| 9 | **Window Functions** | `OVER()`, `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `LEAD`/`LAG`, `ROWS BETWEEN`. | *Consecutive Numbers*, *Running Total*, *Moving Average*, *Top 3 Salaries (LC 185)* |
| 10| **Recursive CTEs** | `WITH RECURSIVE`: anchor + recursive step, hierarchy traversal, date series. | *Org Chart Hierarchy Level*, *Zero-Order Calendar Generation* |
| 11| **Conditional Pivoting** | Row-to-column pivoting using conditional `CASE WHEN` and `SUM()` / `MAX()`. | *Quarterly Sales Pivot*, *Occupations (HackerRank Classic)* |
| 12| **Existence Predicates** | `EXISTS`, `NOT EXISTS`, short-circuit evaluation, CBO Semi-Joins, `SELECT 1` myth. | *High-Value Customers (Semi-Join)*, *Departments Without Active Staff (Anti-Join)* |

---

## 🧪 Test Suite & Quality Gate

SQL Arena includes an adversarial testing battery and an automated curriculum harness (`harness/cli.js`) with **138 automated checks**:

```text
======================================================================
SQL ARENA VERIFICATION BATTERY (138 / 138 TESTS PASSING)
======================================================================
  ✅ test_all_problems.js                  36 / 36 PASS  (Curriculum solutions against MySQL)
  ✅ test_adversarial_m1.js                28 / 28 PASS  (Syntax mutations, comments, injections)
  ✅ test_curriculum_edge_cases.js         18 / 18 PASS  (Ties, non-consecutive IDs, UTF-8 bytes)
  ✅ test_stress_challenger.js             15 / 15 PASS  (Concurrency bursts, timeout recovery)
  ✅ test_adversarial_m2_challenger.js     12 / 12 PASS  (Parenthesized queries, whitespace)
  ✅ test_edge_cases.js                    12 / 12 PASS  (0-row projection, BigNumber formatting)
  ✅ test_api_security.js                  10 / 10 PASS  (CORS, rate limiting, payload limits)
  ✅ test_runner_regression.js             10 / 10 PASS  (Positional matching, solution secrecy)
======================================================================
```

### Curriculum Harness CLI:
```bash
# Lint all theoretical guides against the 6-section Staff Engineer specification
node harness/cli.js lint-topics

# Validate a specific problem against MySQL 8 Sandbox (DDL, DML, solution & empty-table edge case)
node harness/cli.js test-problem exists-2

# Run the complete verification suite
node harness/cli.js validate-all
```

---

## 🚀 Quickstart

### Prerequisites
- **Node.js** (v18.0 or higher)
- **MySQL Server** (v8.0+ running locally on port `3306`)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/bapatata688/sql-arena.git
cd sql-arena
npm run install:all
```

### 2. Configure Environment
Create the sandbox database in MySQL:
```sql
CREATE DATABASE IF NOT EXISTS sql_arena_sandbox;
```
Configure your `.env` in `backend/` (or copy `.env.example`):
```env
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=sql_arena_sandbox
```

### 3. Launch Platform

#### On Windows (PowerShell One-Click):
```powershell
.\scripts\start.ps1
```

#### On Linux / macOS:
```bash
chmod +x ./scripts/start.sh
./scripts/start.sh
```

#### Or using npm:
```bash
# Terminal 1: Backend
npm run dev:backend

# Terminal 2: Frontend
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⌨️ Editor Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| `Ctrl + Enter` | **Run Code** | Executes query against the active problem sandbox. |
| `Ctrl + Shift + Enter` | **Submit Solution** | Evaluates against the reference solution and logs to telemetry. |

---

## 📂 Project Structure

```text
sql-arena/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI with MySQL 8.0 service container
├── backend/
│   ├── curriculum/            # Auto-synchronized JSON topic & problem catalogs
│   ├── db.js                  # MySQL2 hardened connection pool
│   ├── runner.js              # Mutex-isolated query execution & diff engine
│   ├── server.js              # Hardened Express API (Rate-limiting, CORS, validations)
│   ├── telemetry.js           # Telemetry logging to sql_progress.txt & jsonl
│   ├── problems_data.js       # Core problem definitions & schemas
│   ├── problems_advanced.js   # Advanced problems (Recursive, Pivot, Window, Exists)
│   └── test_*.js              # 8 automated test suites
├── frontend/
│   ├── src/
│   │   ├── components/        # Monaco editor, Navbar, Diff Console, Study Guides
│   │   ├── App.jsx            # State management, draft caching & shortcuts
│   │   └── index.css          # Tailwind CSS v4 styling
│   └── vite.config.js         # Proxy configuration & build optimization
├── harness/
│   ├── cli.js                 # Unified CLI for topic linting & sandbox validation
│   ├── templates/             # Canonical templates for guides & problems
│   └── validators/            # Static & dynamic verification scripts
├── docs/
│   └── ARCHITECTURE_REVIEW_AND_QA_DIAGNOSTIC.md
├── scripts/
│   ├── start.ps1              # Windows one-click launcher
│   └── start.sh               # Unix/macOS one-click launcher
├── .env.example
├── .gitignore
├── LICENSE                    # MIT License
├── package.json               # Root monorepo workspace scripts
├── README.md                  # Documentation (English)
└── README.es.md               # Documentation (Spanish)
```

---

## 👤 Author

**Diego Alejandro Escobar Barahona**  
*Data Engineer & Cloud Specialist*  
Soyapango, El Salvador  

- 📜 **Certifications:** Google Cloud Certified — Associate Data Practitioner (ADP) • EF SET English C1 Advanced
- 🐙 **GitHub:** [github.com/bapatata688](https://github.com/bapatata688)
- 💼 **LinkedIn:** [linkedin.com/in/diego-escobar-459256394](https://www.linkedin.com/in/diego-escobar-459256394)
- 📧 **Contact:** diegoalejandroescobarahona1@gmail.com

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
