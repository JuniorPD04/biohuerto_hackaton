-- Corrige el hash de la cuenta admin por defecto para que coincida con
-- la contraseña de demo mostrada en el login: biohuerto2026
UPDATE usuarios
SET password_hash = '$2b$12$dIvrsZISuGp0Yl1jZRK.lO2SAn2q8uJgfTre9H5ExiCR/cbQ/FTvO'
WHERE email = 'rosa.campos@biohuerto.pe';
