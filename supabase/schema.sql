-- ============================================================
-- Stacks Drive v1 — Schéma Supabase (Postgres)
-- À exécuter dans l'éditeur SQL de Supabase (Dashboard > SQL Editor).
-- Ordre : tables → triggers → RLS → seed.
-- Le script est conçu pour être relancé sans doublon (seed protégé).
-- ============================================================

-- ---------- Profils ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role text not null default 'passager' check (role in ('passager', 'chauffeur')),
  -- Véhicule (chauffeurs)
  vehicle_type text check (vehicle_type is null or vehicle_type in ('Berline', 'SUV', 'Citadine', 'Moto')),
  vehicle_brand text,
  vehicle_model text,
  vehicle_color text,
  plate text,
  seats int check (seats is null or (seats between 1 and 9)),
  is_online boolean not null default false,
  -- Vérification par l'équipe Stacks Drive (badge « Vérifié »).
  -- Modifiable uniquement par un admin (voir trigger plus bas) ou en SQL.
  is_verified boolean not null default false,
  -- Administrateur de la plateforme (tableau de bord /admin).
  -- À définir en SQL : update profiles set is_admin = true where email = '...';
  is_admin boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Courses ----------
create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.profiles (id) on delete cascade,
  departure text not null,
  destination text not null,
  departure_time timestamptz not null,
  seats_total int not null check (seats_total between 1 and 9),
  seats_available int not null check (seats_available >= 0 and seats_available <= seats_total),
  -- Prix en FCFA PAR PLACE (par passager). Course solo = 1 place = prix total.
  -- Course partagée = prix par passager. Prix fixe, jamais de surge.
  price int not null check (price > 0),
  ride_type text not null default 'solo' check (ride_type in ('solo', 'partagee')),
  vehicle_type text not null default 'Berline'
    check (vehicle_type in ('Berline', 'SUV', 'Citadine', 'Moto')),
  vehicle_label text not null default '',
  payment_methods text[] not null default '{especes}',
  note text not null default '',
  status text not null default 'published'
    check (status in ('published', 'draft', 'closed')),
  -- Nom / contacts affichés (utiles pour les courses démo sans compte chauffeur).
  driver_name text not null default 'Chauffeur Stacks Drive',
  driver_phone text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Réservations ----------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  passenger_id uuid not null references public.profiles (id) on delete cascade,
  seats int not null default 1 check (seats between 1 and 4),
  -- Montants figés à la réservation (snapshot) : un changement de taux
  -- de commission plus tard ne modifie jamais les courses déjà réservées.
  total_price int not null check (total_price > 0),
  platform_fee int not null default 0 check (platform_fee >= 0),
  driver_share int not null default 0 check (driver_share >= 0),
  payment_method text not null default 'especes'
    check (payment_method in ('especes', 'airtel', 'moov')),
  message text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  unique (ride_id, passenger_id)
);

-- ---------- updated_at automatique ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rides_set_updated_at on public.rides;
create trigger rides_set_updated_at
  before update on public.rides
  for each row execute function public.set_updated_at();

-- ---------- Création automatique du profil à l'inscription ----------
-- Supabase Auth crée la ligne auth.users ; ce trigger crée le profil public
-- en reprenant les métadonnées du formulaire d'inscription
-- (full_name, phone, role). Aucune action manuelle nécessaire.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case when new.raw_user_meta_data ->> 'role' in ('passager', 'chauffeur')
      then new.raw_user_meta_data ->> 'role'
      else 'passager' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Places disponibles : synchronisées automatiquement ----------
-- À chaque réservation, les places sont déduites ; à chaque annulation,
-- elles sont rendues. La fonction est SECURITY DEFINER : elle tourne avec
-- les droits du propriétaire et n'est pas bloquée par la RLS.
create or replace function public.sync_ride_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.rides
      set seats_available = seats_available - new.seats
      where id = new.ride_id;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status <> 'cancelled' and new.status = 'cancelled' then
      update public.rides
        set seats_available = least(seats_total, seats_available + old.seats)
        where id = new.ride_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    update public.rides
      set seats_available = least(seats_total, seats_available + old.seats)
      where id = old.ride_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists bookings_sync_ride_seats on public.bookings;
create trigger bookings_sync_ride_seats
  after insert or update or delete on public.bookings
  for each row execute function public.sync_ride_seats();

-- ---------- Anti-escalade : is_verified / is_admin réservés aux admins ----------
-- Un utilisateur ne peut pas s'auto-vérifier ni se promouvoir admin via
-- l'API. Les modifications directes en SQL (auth.uid() null) restent
-- possibles : c'est comme ça qu'on nomme le premier admin.
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  if new.is_verified is distinct from old.is_verified
     or new.is_admin is distinct from old.is_admin then
    if auth.uid() is not null then
      select p.is_admin into caller_is_admin
        from public.profiles p where p.id = auth.uid();
      if coalesce(caller_is_admin, false) is not true then
        raise exception 'Seul un administrateur peut modifier la vérification ou le rôle admin.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_privilege_escalation();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.rides enable row level security;
alter table public.bookings enable row level security;

-- Profils : lisibles par tous (noms des chauffeurs sur les courses),
-- modifiables uniquement par leur propriétaire (ou un admin).
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select using (true);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users insert their own profile" on public.profiles;
create policy "Users insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Admins update any profile" on public.profiles;
create policy "Admins update any profile"
  on public.profiles for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Courses : lecture publique des courses publiées ; un chauffeur voit aussi
-- ses propres courses (brouillon / fermée). Seuls les chauffeurs publient.
drop policy if exists "Published rides are publicly readable" on public.rides;
create policy "Published rides are publicly readable"
  on public.rides for select
  using (
    status = 'published'
    or driver_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "Drivers publish rides" on public.rides;
create policy "Drivers publish rides"
  on public.rides for insert
  with check (
    auth.uid() = driver_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'chauffeur'
    )
  );

drop policy if exists "Drivers manage their own rides" on public.rides;
create policy "Drivers manage their own rides"
  on public.rides for update
  using (auth.uid() = driver_id)
  with check (auth.uid() = driver_id);

drop policy if exists "Drivers delete their own rides" on public.rides;
create policy "Drivers delete their own rides"
  on public.rides for delete
  using (auth.uid() = driver_id);

-- Réservations : un passager ne voit que les siennes ; un chauffeur voit
-- celles de ses courses ; un admin voit tout.
drop policy if exists "Passengers, drivers and admins read bookings" on public.bookings;
create policy "Passengers, drivers and admins read bookings"
  on public.bookings for select
  using (
    auth.uid() = passenger_id
    or exists (
      select 1 from public.rides r
      where r.id = bookings.ride_id and r.driver_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );

drop policy if exists "Passengers book published rides" on public.bookings;
create policy "Passengers book published rides"
  on public.bookings for insert
  with check (
    auth.uid() = passenger_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'passager'
    )
    and exists (
      select 1 from public.rides r
      where r.id = ride_id
        and r.status = 'published'
        and r.driver_id is distinct from auth.uid()
        and r.departure_time > now()
        and bookings.seats <= r.seats_available
    )
  );

drop policy if exists "Passengers cancel their own bookings" on public.bookings;
create policy "Passengers cancel their own bookings"
  on public.bookings for update
  using (auth.uid() = passenger_id and status in ('pending', 'confirmed'))
  with check (auth.uid() = passenger_id and status = 'cancelled');

drop policy if exists "Drivers manage bookings on their rides" on public.bookings;
create policy "Drivers manage bookings on their rides"
  on public.bookings for update
  using (
    exists (
      select 1 from public.rides r
      where r.id = bookings.ride_id and r.driver_id = auth.uid()
    )
  )
  with check (
    status in ('confirmed', 'cancelled', 'completed')
    and exists (
      select 1 from public.rides r
      where r.id = bookings.ride_id and r.driver_id = auth.uid()
    )
  );

drop policy if exists "Admins manage all bookings" on public.bookings;
create policy "Admins manage all bookings"
  on public.bookings for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ============================================================
-- Seed — les 6 courses initiales (EXEMPLES FICTIFS)
-- Ces courses sont des démonstrations : aucun vrai chauffeur derrière.
-- Elles restent affichées tant qu'aucun vrai chauffeur n'a publié.
-- driver_id = NULL : aucun compte chauffeur n'est nécessaire pour le seed.
-- Le seed est protégé : relancer le script ne duplique pas les courses.
-- ============================================================
insert into public.rides
  (departure, destination, departure_time, seats_total, seats_available,
   price, ride_type, vehicle_type, vehicle_label, payment_methods, note,
   status, driver_name, driver_phone, is_demo)
select
  departure, destination, departure_time, seats_total, seats_available,
  price, ride_type, vehicle_type, vehicle_label, payment_methods, note,
  status, driver_name, driver_phone, is_demo
from (values
  (
    'Centre-ville', 'Aéroport Léon-Mba', now() + interval '3 hours',
    1, 1, 5000, 'solo', 'Berline', 'Toyota Corolla blanche',
    array['especes', 'airtel', 'moov'],
    'Transfert aéroport, tarif fixe. Départ devant la gare routière, coffre disponible pour les bagages.',
    'published', 'M. Jean N.', '074 00 00 00', true
  ),
  (
    'Glass', 'Nzeng-Ayong', now() + interval '5 hours',
    3, 3, 1200, 'partagee', 'Citadine', 'Kia Picanto grise',
    array['especes', 'airtel', 'moov'],
    'Trajet direct par la voie express. Départ au carrefour de Glass, places à l’avant et à l’arrière.',
    'published', 'Mme Aïcha B.', '074 00 00 00', true
  ),
  (
    'Charbonnages', 'Owendo', now() + interval '1 day',
    2, 2, 1500, 'partagee', 'SUV', 'Hyundai Tucson noire',
    array['especes', 'airtel'],
    'Direction la zone industrielle d’Owendo. Climatisation, départ à l’heure précise.',
    'published', 'M. Serge M.', '074 00 00 00', true
  ),
  (
    'Nzeng-Ayong', 'Centre-ville', now() + interval '1 day 3 hours',
    3, 3, 900, 'partagee', 'Berline', 'Toyota Yaris bleue',
    array['especes', 'moov'],
    'Trajet du matin vers le centre-ville. Possibilité de s’arrêter à Mont-Bouët sur demande.',
    'published', 'M. Patrick O.', '074 00 00 00', true
  ),
  (
    'Akanda', 'Aéroport Léon-Mba', now() + interval '2 days',
    1, 1, 2500, 'solo', 'SUV', 'Toyota RAV4 blanche',
    array['especes', 'airtel', 'moov'],
    'Course privée vers l’aéroport, tarif fixe. Je vous attends devant le portail, appelez-moi à l’arrivée.',
    'published', 'Mme Nadège K.', '074 00 00 00', true
  ),
  (
    'Owendo', 'Nzeng-Ayong', now() + interval '3 days',
    1, 1, 700, 'solo', 'Moto', 'Yamaha YBR rouge',
    array['especes', 'airtel'],
    'Moto-taxi rapide pour traverser la ville aux heures de pointe. Casque fourni.',
    'published', 'M. Yann E.', '074 00 00 00', true
  )
) as seed (
  departure, destination, departure_time, seats_total, seats_available,
  price, ride_type, vehicle_type, vehicle_label, payment_methods, note,
  status, driver_name, driver_phone, is_demo
)
where not exists (select 1 from public.rides where is_demo = true);

-- Fin du schéma. Vérifications rapides :
-- select count(*) from public.rides where is_demo;  -- doit renvoyer 6
-- select count(*) from public.profiles;            -- 0 tant que personne ne s'est inscrit
