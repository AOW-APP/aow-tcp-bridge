-- Add lac column to cell_towers
ALTER TABLE public.cell_towers ADD COLUMN lac integer NOT NULL DEFAULT 0;

-- Drop old index and create a composite index including lac
DROP INDEX IF EXISTS public.idx_cell_towers_identity;
CREATE INDEX idx_cell_towers_identity ON public.cell_towers (mcc, mnc, lac, cell_id);
