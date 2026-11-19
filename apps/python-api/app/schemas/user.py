from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from enum import Enum


class Role(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"


class UserBase(BaseModel):
    email: EmailStr
    name: str
    avatar_url: Optional[str] = None


class UserCreate(UserBase):
    workspace_id: str
    role: Role = Role.MEMBER


class UserUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class UserResponse(UserBase):
    id: str
    workspace_id: str
    role: Role
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
