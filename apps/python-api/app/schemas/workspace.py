from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.user import UserResponse


class WorkspaceBase(BaseModel):
    name: str
    slug: str


class WorkspaceCreate(BaseModel):
    name: str


class WorkspaceResponse(WorkspaceBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkspaceWithUsers(WorkspaceResponse):
    users: List[UserResponse] = []
    user_count: int = 0
    bug_report_count: int = 0
