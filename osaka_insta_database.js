/* ============================================================
   osaka_insta_database.js – Dữ liệu Instagram riêng cho chi nhánh Osaka
   Dùng cho trang /osaka/ (物件紹介 section)

   Khi copy sang chi nhánh khác (tokyo, nagoya, fukuoka, okinawa):
   - Đổi tên file / biến branchInstagramPosts cho đúng chi nhánh
   - Lấy list permalink tương ứng từ acch_insta_database.js (branchData.<id>.instagramPosts)
   ============================================================ */

const branchInstagramPosts = [
    { permalink: "https://www.instagram.com/p/DaMr2P8DxN0/" },
    { permalink: "https://www.instagram.com/p/DZ33aD8j2sl/" },
    { permalink: "https://www.instagram.com/p/DZ1TLCAD4uw/" },
    { permalink: "https://www.instagram.com/p/DZy1KENj4Lf/" },
    { permalink: "https://www.instagram.com/p/DY04JOej77W/" },
    { permalink: "https://www.instagram.com/p/DYYkL2XD7Gx/" },
    { permalink: "https://www.instagram.com/p/DXvntpdD9rP/" },
    { permalink: "https://www.instagram.com/p/DWGLlxqjzj9/" },
    { permalink: "https://www.instagram.com/p/DWAzyA5jwQI/" },
    { permalink: "https://www.instagram.com/p/DV8rz1TjxCf/" },
    { permalink: "https://www.instagram.com/p/DVXp5TwDxH-/" },
    { permalink: "https://www.instagram.com/p/DVQM1I7j2iq/" },
    { permalink: "https://www.instagram.com/p/DU2cqztD40Q/" },
    { permalink: "https://www.instagram.com/p/DUF5l2EjyV-/" },
    { permalink: "https://www.instagram.com/p/DUE-5r_D30k/" },
    { permalink: "https://www.instagram.com/p/DUCad7mD5XM/" },
    { permalink: "https://www.instagram.com/p/DT_x964DyyH/" },
    { permalink: "https://www.instagram.com/p/DTpp3D0D4CR/" },
    { permalink: "https://www.instagram.com/p/DTcOSUSj8Qo/" },
    { permalink: "https://www.instagram.com/p/DSG3C8ND67B/" },
    { permalink: "https://www.instagram.com/p/DRo1JBvD6My/" },
    { permalink: "https://www.instagram.com/p/DRHXnNXj3jB/" },
];

const DEFAULT_CAPTION = "株式会社バディエステート　不動産買取　大阪・東京・名古屋・福岡・沖縄(@buddyestate1000)がシェアした投稿";