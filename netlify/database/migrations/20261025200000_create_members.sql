-- Rollertown Rewards member accounts and sign-in sessions.
CREATE TABLE members (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,          -- stored lowercased
  password_hash   TEXT NOT NULL,                 -- scrypt hash, never the password
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  birthday        DATE,
  state           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- points, tickets, rewards, favorites
  failed_logins   INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,                  -- SHA-256 of the session token
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX sessions_member_id_idx ON sessions (member_id);
