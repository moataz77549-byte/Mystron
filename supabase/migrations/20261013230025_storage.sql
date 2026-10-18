-- Storage uploads deliberately disabled until authenticated editorial upload pipeline.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('editorial','editorial',true,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Public bucket is for published covers only. Draft assets require a separate private bucket.
-- No INSERT/UPDATE/DELETE policies: arbitrary client uploads remain forbidden.
