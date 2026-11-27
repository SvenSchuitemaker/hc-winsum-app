insert into public.categories (slug, title, description)
select 'zaal', 'Zaal', 'Oefeningen voor zaalhockey.'
where not exists (
    select 1 from public.categories where slug = 'zaal'
)
on conflict do nothing;
