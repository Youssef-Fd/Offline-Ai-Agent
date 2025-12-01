*** Begin Patch
*** Add File: sql/schema.sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  stored_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
*** End Patch
