-- BugSnap Database Schema for Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'member');
CREATE TYPE session_status AS ENUM ('recording', 'processing', 'completed', 'failed');
CREATE TYPE log_type AS ENUM ('console', 'network', 'click', 'error', 'navigation', 'input');
CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error');
CREATE TYPE severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE report_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'wont_fix');

-- Workspaces (Company/Organization)
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams within a workspace (Frontend, Backend, QA, etc.)
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#F97316',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    password_hash TEXT, -- NULL if using OAuth only
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role user_role DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members (many-to-many: users can be in multiple teams)
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- Workspace invites
CREATE TABLE workspace_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email VARCHAR(255), -- Optional: specific email invite
    token VARCHAR(255) UNIQUE NOT NULL,
    role user_role DEFAULT 'member',
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recording sessions
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status session_status DEFAULT 'recording',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video recordings
CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    url TEXT,
    duration INTEGER, -- seconds
    size INTEGER, -- bytes
    mime_type VARCHAR(50) DEFAULT 'video/webm',
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session logs (console, network, clicks, errors)
CREATE TABLE session_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type log_type NOT NULL,
    level log_level DEFAULT 'info',
    message TEXT NOT NULL,
    data JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Bug reports
CREATE TABLE bug_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Assignment
    assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,

    -- Bug details
    title VARCHAR(500) NOT NULL,
    description TEXT,
    steps_to_reproduce TEXT[], -- Array of steps
    expected_result TEXT,
    actual_result TEXT,

    -- Classification
    severity severity DEFAULT 'medium',
    status report_status DEFAULT 'open',

    -- AI analysis
    ai_summary TEXT,
    ai_root_cause TEXT,
    ai_suggestions TEXT[],

    -- Metadata
    url TEXT,
    browser_info JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_workspace ON users(workspace_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_teams_workspace ON teams(workspace_id);
CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_session_logs_session ON session_logs(session_id);
CREATE INDEX idx_session_logs_type ON session_logs(session_id, type);
CREATE INDEX idx_bug_reports_workspace ON bug_reports(workspace_id);
CREATE INDEX idx_bug_reports_reporter ON bug_reports(reporter_id);
CREATE INDEX idx_bug_reports_assigned_user ON bug_reports(assigned_to_user_id);
CREATE INDEX idx_bug_reports_assigned_team ON bug_reports(assigned_to_team_id);
CREATE INDEX idx_bug_reports_status ON bug_reports(workspace_id, status);
CREATE INDEX idx_workspace_invites_token ON workspace_invites(token);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bug_reports_updated_at BEFORE UPDATE ON bug_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies should be configured based on your auth strategy
-- For now, we'll use service role key which bypasses RLS
