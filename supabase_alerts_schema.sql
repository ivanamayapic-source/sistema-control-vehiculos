-- ==========================================================================
-- SCHEMA Y TABLAS ADICIONALES PARA SISTEMA DE ALERTAS (CORREO)
-- ==========================================================================

-- Crear tabla document_alerts para garantizar la idempotencia de las alertas
CREATE TABLE IF NOT EXISTS public.document_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id TEXT NOT NULL,
  document_type TEXT NOT NULL, -- 'SOAT', 'RTM', 'LICENCIA'
  alert_type TEXT NOT NULL,    -- '30_days', '15_days', '7_days', '1_day', 'expired'
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  recipient_email TEXT NOT NULL,
  status TEXT DEFAULT 'sent', -- 'sent', 'error'
  error_message TEXT,
  CONSTRAINT fk_vehicle FOREIGN KEY (vehicle_id) REFERENCES public.vehiculos (id) ON DELETE CASCADE
);

-- Indice para facilitar consultas rápidas de idempotencia (EVITAR DUPLICADOS)
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_unique ON public.document_alerts (vehicle_id, document_type, alert_type);

-- Habilitar RLS
ALTER TABLE public.document_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica a document_alerts" ON public.document_alerts;
CREATE POLICY "Permitir lectura publica a document_alerts"
  ON public.document_alerts FOR SELECT
  USING (true);

-- Las inserciones se harán en backend con el service_role key, evadiendo RLS por seguridad.
