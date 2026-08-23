-- Enable PostGIS extension
create extension if not exists postgis with schema extensions;

-- Create cell_towers table
create table public.cell_towers (
    id bigint generated always as identity primary key,
    radio text not null, -- e.g., 'lte', 'gsm', 'umts'
    mcc integer not null,
    mnc integer not null,
    cell_id bigint not null,
    location extensions.geography(point) not null,
    range integer, -- accuracy/range in meters
    samples integer, -- number of samples used to calculate this point
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

-- Indices for fast lookups by cell identification
create index idx_cell_towers_identity on public.cell_towers (mcc, mnc, cell_id);

-- Spatial index for location-based queries
create index idx_cell_towers_location on public.cell_towers using gist (location);

-- Trigger to update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger tr_cell_towers_updated_at
before update on public.cell_towers
for each row execute function update_updated_at_column();

-- Enable RLS (Optional but good practice)
alter table public.cell_towers enable row level security;

-- Policies (Public read-only for now, Service Role for write)
create policy "Allow public read-only access"
on public.cell_towers for select
using (true);
