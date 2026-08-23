-- Add a unique constraint to ensure upserts can run on target columns
ALTER TABLE public.cell_towers 
ADD CONSTRAINT unique_cell_tower_identity UNIQUE (mcc, mnc, lac, cell_id);
