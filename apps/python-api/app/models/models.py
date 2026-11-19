import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, JSON, Boolean, Integer, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from app.core.base import Base
import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    member = "member"


class BugSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class BugStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"
    wont_fix = "wont_fix"


class SessionStatus(str, enum.Enum):
    recording = "recording"
    completed = "completed"
    failed = "failed"


def utc_now():
    return datetime.now(timezone.utc)


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False)
    logo_url = Column(Text)
    settings = Column(JSON, default={})
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    users = relationship("User", back_populates="workspace")
    teams = relationship("Team", back_populates="workspace")
    bug_reports = relationship("BugReport", back_populates="workspace")
    invites = relationship("WorkspaceInvite", back_populates="workspace")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    password_hash = Column(Text)
    avatar_url = Column(Text)
    role = Column(SQLEnum(UserRole), default=UserRole.member)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", back_populates="users")
    bug_reports = relationship("BugReport", back_populates="reporter", foreign_keys="BugReport.reporter_id")
    assigned_bugs = relationship("BugReport", back_populates="assigned_user", foreign_keys="BugReport.assigned_to_user_id")
    sessions = relationship("Session", back_populates="user")
    team_memberships = relationship("TeamMember", back_populates="user")


class Team(Base):
    __tablename__ = "teams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    color = Column(String(7), default="#F97316")
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", back_populates="teams")
    members = relationship("TeamMember", back_populates="team")
    assigned_bugs = relationship("BugReport", back_populates="assigned_team")


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    team = relationship("Team", back_populates="members")
    user = relationship("User", back_populates="team_memberships")


class WorkspaceInvite(Base):
    __tablename__ = "workspace_invites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255))
    token = Column(String(255), unique=True, nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.member)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=utc_now)

    workspace = relationship("Workspace", back_populates="invites")


class BugReport(Base):
    __tablename__ = "bug_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    reporter_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    title = Column(String(500), nullable=False)
    description = Column(Text)
    steps_to_reproduce = Column(ARRAY(Text), default=[])
    expected_result = Column(Text)
    actual_result = Column(Text)
    severity = Column(SQLEnum(BugSeverity), default=BugSeverity.medium)
    status = Column(SQLEnum(BugStatus), default=BugStatus.open)
    url = Column(Text)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="SET NULL"))
    assigned_to_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    assigned_to_team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="SET NULL"))
    browser_info = Column(JSON)
    ai_summary = Column(Text)
    ai_root_cause = Column(Text)
    ai_suggestions = Column(ARRAY(Text), default=[])
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", back_populates="bug_reports")
    reporter = relationship("User", back_populates="bug_reports", foreign_keys=[reporter_id])
    assigned_user = relationship("User", back_populates="assigned_bugs", foreign_keys=[assigned_to_user_id])
    assigned_team = relationship("Team", back_populates="assigned_bugs")
    session = relationship("Session", back_populates="bug_report")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(SQLEnum(SessionStatus), default=SessionStatus.recording)
    session_metadata = Column(JSON)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    user = relationship("User", back_populates="sessions")
    recording = relationship("Recording", back_populates="session", uselist=False)
    logs = relationship("SessionLog", back_populates="session")
    bug_report = relationship("BugReport", back_populates="session", uselist=False)


class Recording(Base):
    __tablename__ = "recordings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), unique=True, nullable=False)
    url = Column(Text)
    duration = Column(Integer)
    size = Column(Integer)
    thumbnail_url = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    session = relationship("Session", back_populates="recording")


class SessionLog(Base):
    __tablename__ = "session_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(50), default="console")
    level = Column(String(20), default="info")
    message = Column(Text, nullable=False)
    data = Column(JSON)
    timestamp = Column(DateTime(timezone=True), default=utc_now)

    session = relationship("Session", back_populates="logs")
