-- Add meeting_id to whatsapp_cert for manual upload form
ALTER TABLE whatsapp_cert ADD COLUMN meeting_id INTEGER DEFAULT 0;
