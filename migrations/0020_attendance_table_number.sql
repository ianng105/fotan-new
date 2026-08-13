-- Add table_number to attendance (functions/api/attendance.js INSERT references it since v3.0)
ALTER TABLE attendance ADD COLUMN table_number TEXT DEFAULT '';
