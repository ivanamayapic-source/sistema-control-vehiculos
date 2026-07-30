-- ==========================================================================
-- SCHEMA Y TABLA SUPABASE PARA SISTEMA DE CONTROL VEHICULAR CEDI
-- ==========================================================================

-- 1. Crear tabla vehiculos
CREATE TABLE IF NOT EXISTS public.vehiculos (
  id TEXT PRIMARY KEY,
  placa TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  cedula TEXT NOT NULL,
  tipo_vehiculo TEXT NOT NULL DEFAULT 'MOTOCICLETA',
  empresa TEXT DEFAULT 'CEDI',
  centro_distribucion TEXT DEFAULT 'CEDI',
  cargo TEXT DEFAULT 'COLABORADOR',
  soat_vencimiento DATE,
  rtm_vencimiento DATE,
  licencia_categoria TEXT DEFAULT 'B1',
  licencia_vencimiento DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;

-- 3. Crear Políticas de Permiso (Lectura y Escritura para la App Web)
CREATE POLICY "Permitir lectura publica a vehiculos"
  ON public.vehiculos FOR SELECT
  USING (true);

CREATE POLICY "Permitir insercion y actualizacion publica"
  ON public.vehiculos FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. Índice para búsquedas rápidas por placa y cédula
CREATE INDEX IF NOT EXISTS idx_vehiculos_placa ON public.vehiculos (placa);
CREATE INDEX IF NOT EXISTS idx_vehiculos_cedula ON public.vehiculos (cedula);
CREATE INDEX IF NOT EXISTS idx_vehiculos_cd ON public.vehiculos (centro_distribucion);
CREATE INDEX IF NOT EXISTS idx_vehiculos_empresa ON public.vehiculos (empresa);
