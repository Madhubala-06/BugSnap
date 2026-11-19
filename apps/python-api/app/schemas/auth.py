from pydantic import BaseModel, EmailStr
from typing import Optional


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token
    invite_token: Optional[str] = None  # If joining via invite link


class EmailAuthRequest(BaseModel):
    email: EmailStr
    password: str
    invite_token: Optional[str] = None


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    workspace_name: Optional[str] = None  # If creating new workspace
    invite_token: Optional[str] = None  # If joining existing workspace


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    workspace_id: str
    workspace_slug: str


class MeResponse(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: Optional[str] = None
    role: str
    workspace_id: str
    workspace_name: str
    workspace_slug: str
