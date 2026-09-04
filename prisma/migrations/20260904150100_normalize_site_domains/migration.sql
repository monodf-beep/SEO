-- Sites added from URL-prefix Search Console properties before the add-site
-- form learned to parse them were stored as "//example.com/" instead of
-- "example.com". Normalize them, unless the user already has a site with the
-- clean domain (the (userId, domain) unique index would reject the update).
UPDATE "Site" s
SET "domain" = regexp_replace(regexp_replace(s."domain", '^(https?:)?//', ''), '/+$', '')
WHERE (s."domain" ~ '^(https?:)?//' OR s."domain" ~ '/$')
  AND NOT EXISTS (
    SELECT 1 FROM "Site" o
    WHERE o."userId" = s."userId"
      AND o."id" <> s."id"
      AND o."domain" = regexp_replace(regexp_replace(s."domain", '^(https?:)?//', ''), '/+$', '')
  );
