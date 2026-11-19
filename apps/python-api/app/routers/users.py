from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import get_current_user
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


class UserUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: Optional[str]
    role: str
    workspace_id: str
    created_at: str


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get current user's profile"""
    user_service = UserService(db)
    user = await user_service.get_by_id(current_user["sub"])

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    update: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Update current user's profile"""
    user_service = UserService(db)
    user = await user_service.update(
        user_id=current_user["sub"],
        name=update.name,
        avatar_url=update.avatar_url
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user


@router.put("/me/password")
async def change_password(
    update: PasswordUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Change current user's password"""
    user_service = UserService(db)

    user = await user_service.verify_credentials(
        current_user["email"],
        update.current_password
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    await user_service.update_password(current_user["sub"], update.new_password)
    return {"success": True}


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get user by ID (must be in same workspace)"""
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if user["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not in your workspace"
        )

    return user


@router.get("/", response_model=List[UserResponse])
async def list_workspace_users(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """List all users in current workspace"""
    user_service = UserService(db)
    users = await user_service.get_by_workspace(current_user["workspace_id"])
    return users
