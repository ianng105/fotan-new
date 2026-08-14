-- 入錢憑證加入會議編號欄位，讓憑證可以按例會獨立分開
ALTER TABLE whatsapp_cert ADD COLUMN meeting_id INTEGER DEFAULT 0;
