ALTER TABLE notes ADD COLUMN short_code TEXT;
CREATE UNIQUE INDEX notes_short_code_unique ON notes(short_code);

-- Fill legacy rows with eight characters selected from a base62 alphabet.
-- Retry generated values that collide with an existing note.
WITH RECURSIVE
  alphabet(chars) AS (VALUES('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')),
  pending(id) AS (SELECT id FROM notes WHERE short_code IS NULL),
  generated(id, code) AS (
    SELECT id, '' FROM pending
    UNION ALL
    SELECT generated.id,
      generated.code || substr(alphabet.chars, (unicode(substr(hex(randomblob(1)), 1, 1)) % 62) + 1, 1)
    FROM generated, alphabet WHERE length(generated.code) < 8
  )
UPDATE notes SET short_code = (
  SELECT code FROM generated WHERE generated.id = notes.id AND length(code) = 8
)
WHERE short_code IS NULL;
