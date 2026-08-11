# 火炭會聚會簽到系統 v3.0

## 系統網址

| 頁面 | 網址 |
|------|------|
| 嘉賓簽到主頁 | https://fotan.techforliving.net |
| 後台管理 | https://fotan.techforliving.net/admin |
| Telegram Bot | @fotanbot |

---

## 🚀 新用戶快速開始（本機開發）

### 1. Clone 專案

```bash
git clone https://github.com/ianng105/fotan-new.git
cd fotan-new
```

### 2. 安裝依賴

```bash
npm install
```

> 這會安裝所有依賴，包括 **Puppeteer**（用於將 HTML 收據轉換為 PDF）。
> Puppeteer 會自動下載 Chromium 瀏覽器到 `~/.cache/puppeteer/`。

### 3. 設定環境變數

複製範例檔並填上你的 API 金鑰：

```bash
cp .dev.vars.example .dev.vars
```

編輯 `.dev.vars`，填入你的 Qwen AI API 金鑰：

```
QWEN_API_KEY=sk-your-api-key-here
```

> ⚠️ `.dev.vars` 已被 `.gitignore` 忽略，**不會**被 commit 到 git。
> 你需要向專案管理員索取有效的 API 金鑰。

### 4. 啟動服務

```bash
npm start
```

這會同時啟動：
- **Wrangler 開發伺服器**（`http://localhost:8787`）— 應用程式本身
- **PDF Worker**（`http://localhost:3000`）— Puppeteer 收據生成

按 `Ctrl+C` 即可停止所有服務。

### 5. 對外公開（選用）

使用 Cloudflare Tunnel 建立一個臨時的公開網址：

```bash
cloudflared tunnel --url http://localhost:8787
```

---

## 目錄

- [使用手冊](USER_GUIDE.md) — 主頁簽到流程
- [後台管理手冊](ADMIN_GUIDE.md) — 管理功能完整說明
- [開發文件](DEVELOPER.md) — 技術架構、API、資料庫
