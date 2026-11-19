from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleAuthRequest(BaseModel):
    credential: str
    workspace_name: Optional[str] = None
    invite_token: Optional[str] = None


class EmailSignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    workspace_name: Optional[str] = None
    invite_token: Optional[str] = None


class EmailLoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    success: bool
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    user_id: Optional[str] = None
    workspace_id: Optional[str] = None
    workspace_slug: Optional[str] = None
    error: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: Optional[str]
    role: str
    workspace_id: str
    workspace_name: str
    workspace_slug: str


@router.post("/google", response_model=AuthResponse)
async def auth_google(request: GoogleAuthRequest, db=Depends(get_db)):
    """Sign up or login with Google"""
    auth_service = AuthService(db)
    result = await auth_service.signup_with_google(
        credential=request.credential,
        workspace_name=request.workspace_name,
        invite_token=request.invite_token
    )

    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["error"]
        )

    return result


@router.post("/signup", response_model=AuthResponse)
async def signup_email(request: EmailSignupRequest, db=Depends(get_db)):
    """Sign up with email and password"""
    auth_service = AuthService(db)
    result = await auth_service.signup_with_email(
        email=request.email,
        password=request.password,
        name=request.name,
        workspace_name=request.workspace_name,
        invite_token=request.invite_token
    )

    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["error"]
        )

    return result


@router.post("/login", response_model=AuthResponse)
async def login_email(request: EmailLoginRequest, db=Depends(get_db)):
    """Login with email and password"""
    auth_service = AuthService(db)
    result = await auth_service.login_with_email(
        email=request.email,
        password=request.password
    )

    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=result["error"]
        )

    return result


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user), db=Depends(get_db)):
    """Get current user info"""
    auth_service = AuthService(db)
    user = await auth_service.get_me(current_user["sub"])

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user
