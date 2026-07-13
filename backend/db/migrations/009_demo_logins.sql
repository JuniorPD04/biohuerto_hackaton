-- 009_demo_logins.sql
-- Fecha: 2026-07-13
-- Fija la contraseña de demo (biohuerto2026) a un productor y un consumidor,
-- para poder probar los tres paneles (admin/productor/consumidor) sin adivinar
-- los hashes del seed. Reutiliza el mismo hash bcrypt del reseteo de admin.
-- Idempotente: solo actualiza el hash de dos cuentas conocidas.

UPDATE usuarios
SET password_hash = '$2b$12$dIvrsZISuGp0Yl1jZRK.lO2SAn2q8uJgfTre9H5ExiCR/cbQ/FTvO'
WHERE email IN ('carlos.ruiz@agroeco.pe', 'compras@biocenter.pe');
