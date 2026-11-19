from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from app.schemas.user import Role


class InviteBase(BaseModel):
    workspace_id: str
    email: Optional[EmailStr] = None
    role: Role = Role.MEMBER


class InviteCreate(BaseModel):
    email: Optional[EmailStr] = None
    role: Role = Role.MEMBER


class InviteResponse(BaseModel):
    id: str
    workspace_id: str
    token: str
    email: Optional[str] = None
    role: Role
    expires_at: datetime
    used_at: Optional[datetime] = None
    created_at: datetime
    invite_url: str

    class Config:
        from_attributes = True


class InviteUse(BaseModel):
    token: str
