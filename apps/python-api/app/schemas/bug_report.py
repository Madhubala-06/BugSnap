from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ReportStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"
    WONT_FIX = "wont_fix"


class BugReportBase(BaseModel):
    title: str
    description: Optional[str] = None
    steps_to_reproduce: List[str] = []
    expected_result: Optional[str] = None
    actual_result: Optional[str] = None
    severity: Severity = Severity.MEDIUM
    url: Optional[str] = None


class BugReportCreate(BugReportBase):
    session_id: Optional[str] = None
    assigned_to_user_id: Optional[str] = None  # Assign to specific person
    assigned_to_team_id: Optional[str] = None  # Assign to team (frontend, backend, etc.)


class BugReportUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    steps_to_reproduce: Optional[List[str]] = None
    expected_result: Optional[str] = None
    actual_result: Optional[str] = None
    severity: Optional[Severity] = None
    status: Optional[ReportStatus] = None
    assigned_to_user_id: Optional[str] = None
    assigned_to_team_id: Optional[str] = None


class BugReportResponse(BugReportBase):
    id: str
    session_id: Optional[str] = None
    workspace_id: str
    reporter_id: str
    status: ReportStatus

    # Assignment
    assigned_to_user_id: Optional[str] = None
    assigned_to_team_id: Optional[str] = None

    # AI analysis
    ai_summary: Optional[str] = None
    ai_root_cause: Optional[str] = None
    ai_suggestions: List[str] = []

    # Metadata
    browser_info: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BugReportWithDetails(BugReportResponse):
    reporter: Optional["UserResponse"] = None
    assigned_to_user: Optional["UserResponse"] = None
    assigned_to_team: Optional["TeamResponse"] = None


# Import to avoid circular
from app.schemas.user import UserResponse
from app.schemas.team import TeamResponse
BugReportWithDetails.model_rebuild()
