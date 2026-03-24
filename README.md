# 🏆 VioQuiz – Ứng dụng luyện thi lớp 5

Ứng dụng web luyện thi thông minh cho học sinh lớp 5, tương tự VioEdu.  
Hỗ trợ 4 môn học, bảng quản trị nội dung đầy đủ, và tùy chọn MySQL.

---

## 📁 Cấu trúc thư mục

```
vioquiz/
├── server/
│   └── index.js          # Express server + MySQL integration
├── public/
│   ├── index.html        # Trang học sinh
│   ├── css/style.css     # Giao diện chính
│   ├── js/app.js         # Logic quiz
│   ├── data/             # (copy questions.json vào đây cho static hosting)
│   └── admin/
│       ├── index.html    # Bảng quản trị
│       └── admin.js      # Logic admin
├── data/
│   └── questions.json    # Ngân hàng câu hỏi (fallback khi không có MySQL)
├── package.json
├── .env.example
└── README.md
```

---

## 🚀 Chạy local (không cần MySQL)

```bash
# 1. Cài Node.js (v16+) từ https://nodejs.org

# 2. Clone hoặc giải nén project
cd vioquiz

# 3. Cài dependencies
npm install

# 4. Chạy server
npm start
# → Mở http://localhost:3000
# → Admin: http://localhost:3000/admin
```

> **Chú ý:** Nếu không có MySQL, app sẽ tự động dùng file `data/questions.json`. Mọi thay đổi trên admin panel sẽ được lưu thẳng vào file JSON.

---

## 🗄️ Kết nối MySQL

### Cài đặt MySQL local

```bash
# Ubuntu/Debian
sudo apt install mysql-server
sudo mysql_secure_installation

# macOS (Homebrew)
brew install mysql
brew services start mysql

# Windows: Tải MySQL Installer từ https://dev.mysql.com/downloads/installer/
```

### Tạo database

```sql
CREATE DATABASE vioquiz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'vioquiz'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON vioquiz.* TO 'vioquiz'@'localhost';
FLUSH PRIVILEGES;
```

### Cấu hình .env

```bash
cp .env.example .env
# Chỉnh sửa .env với thông tin database của bạn
```

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=vioquiz
DB_PASSWORD=your_password
DB_NAME=vioquiz
```

```bash
npm start
# → App sẽ tự tạo bảng và import dữ liệu từ JSON vào MySQL
```

---

## 🌐 Deploy lên Render.com (MIỄN PHÍ)

Render cho phép chạy Node.js + MySQL miễn phí.

### Bước 1: Đẩy code lên GitHub

```bash
git init
git add .
git commit -m "VioQuiz initial commit"
git remote add origin https://github.com/YOUR_USERNAME/vioquiz.git
git push -u origin main
```

### Bước 2: Tạo MySQL trên Render

1. Vào https://render.com → Đăng ký miễn phí
2. Dashboard → **New** → **PostgreSQL** (hoặc dùng Railway cho MySQL)
3. Lưu lại thông tin kết nối

> **Tip:** Dùng **Railway.app** nếu cần MySQL thuần túy (miễn phí 500MB/tháng)

### Bước 3: Tạo Web Service trên Render

1. Dashboard → **New** → **Web Service**
2. Connect GitHub repo `vioquiz`
3. Cài đặt:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. Thêm Environment Variables:
   ```
   DB_HOST = your-mysql-host.railway.app
   DB_PORT = 3306
   DB_USER = root
   DB_PASSWORD = xxxx
   DB_NAME = railway
   PORT = 3000
   ```
5. Click **Create Web Service**
6. Sau ~2 phút → App live tại `https://vioquiz.onrender.com`

---

## 🌐 Deploy lên Railway.app (MIỄN PHÍ – Khuyến nghị)

Railway là lựa chọn dễ nhất cho MySQL + Node.js.

```bash
# Cài Railway CLI
npm install -g @railway/cli

# Đăng nhập
railway login

# Tạo project
railway init

# Thêm MySQL
railway add --plugin mysql

# Deploy
railway up

# Xem URL
railway domain
```

Sau khi MySQL được thêm, Railway tự set env vars `MYSQLHOST`, `MYSQLPORT`, etc.  
Cập nhật `server/index.js` dòng DB_CONFIG nếu cần:

```js
const DB_CONFIG = {
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
  port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'vioquiz',
};
```

---

## 🌐 Deploy lên Netlify/GitHub Pages (Frontend-only, không cần server)

Nếu chỉ muốn deploy frontend (không cần admin CRUD):

1. Copy `public/data/questions.json` vào thư mục `public/data/`
2. Sửa `public/js/app.js` dòng đầu thành:
   ```js
   const API = ''; // dùng fetch local JSON
   ```
3. Deploy thư mục `public/` lên Netlify:
   - Drag & drop thư mục `public/` vào https://app.netlify.com/drop
   - Hoặc connect GitHub và set **Publish directory** = `public`

---

## 📋 Cấu trúc JSON câu hỏi

```json
{
  "subjects": [
    {
      "id": "math",
      "name": "Toán học",
      "name_en": "Math",
      "icon": "🔢",
      "color": "#FF6B6B",
      "topics": [
        {
          "id": "addition",
          "name": "Cộng và Trừ",
          "questions": [
            {
              "id": "m1",
              "text": "345 + 678 = ?",
              "options": ["1023", "1013", "1033", "1003"],
              "answer": 0
            }
          ]
        }
      ]
    }
  ]
}
```

**Ghi chú:** `answer` là index của đáp án đúng trong mảng `options` (0=A, 1=B, 2=C, 3=D)

---

## 🎮 Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| 🎯 4 môn học | Toán, Toán Anh, Tiếng Việt, Tiếng Anh |
| 🔀 Random | Xáo trộn câu hỏi và đáp án |
| ⏱️ Bộ đếm giờ | 10/15/30/60 phút hoặc không giới hạn |
| 📊 Kết quả | Điểm số, xem đáp án đúng/sai |
| 🏅 Leaderboard | Bảng xếp hạng lưu local |
| 📱 Responsive | Hỗ trợ điện thoại |
| 🗄️ MySQL | Tùy chọn database, fallback JSON |
| 🔧 Admin Panel | CRUD môn học, chủ đề, câu hỏi |

---

## 🔧 Thêm môn học mới qua Admin Panel

1. Truy cập `/admin`
2. Vào **Môn học** → **Thêm môn học**
3. Điền ID (vd: `science`), tên, icon emoji, màu sắc
4. Vào **Thêm chủ đề** → Chọn môn vừa tạo
5. Vào **Câu hỏi** → **Thêm câu hỏi** → Chọn chủ đề → Điền nội dung

---

## 📞 Hỗ trợ

Nếu gặp lỗi, hãy kiểm tra:
1. Node.js version ≥ 16: `node --version`
2. Cổng 3000 chưa bị dùng: `lsof -i :3000`
3. MySQL đang chạy: `sudo systemctl status mysql`
4. File `.env` đã được cấu hình đúng
