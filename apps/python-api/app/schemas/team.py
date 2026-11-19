from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class TeamBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#F97316"  # Orange default


class TeamCreate(TeamBase):
    pass


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class TeamResponse(TeamBase):
    id: str
    workspace_id: str
    created_at: datetime
    updated_at: datetime
    member_count: int = 0

    class Config:
        from_attributes = True


class TeamMemberAdd(BaseModel):
    user_id: str


class TeamWithMembers(TeamResponse):
    members: List["UserResponse"] = []


# Import here to avoid circular import
from app.schemas.user import UserResponse
TeamWithMembers.model_rebuild()
